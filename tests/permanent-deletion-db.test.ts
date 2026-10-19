import { describe, expect, it } from "vitest";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
const local = process.env['URS_ISOLATED_PG_SOCKET'];
const suite = local === '/tmp/urs-pg-local' ? describe : describe.skip;
// Never inherit a production connection: explicit local Unix socket, port and user.
const args = ['-h','/tmp/urs-pg-local','-p','55439','-U','nobody','-d','urs_deletion_test','-v','ON_ERROR_STOP=1','-At'];
function sql(query: string) { return execFileSync('psql',[...args,'-c',query],{ encoding:'utf8',stdio:['ignore','pipe','pipe'] }).trim(); }
const a='10000000-0000-4000-8000-000000000001', b='10000000-0000-4000-8000-000000000002', o='10000000-0000-4000-8000-000000000003';
function reset() {
 execFileSync('psql',['-h','/tmp/urs-pg-local','-p','55439','-U','nobody','-d','postgres','-v','ON_ERROR_STOP=1','-c','DROP DATABASE IF EXISTS urs_deletion_test;'],{stdio:'pipe'});
 execFileSync('psql',['-h','/tmp/urs-pg-local','-p','55439','-U','nobody','-d','postgres','-v','ON_ERROR_STOP=1','-c','CREATE DATABASE urs_deletion_test;'],{stdio:'pipe'});
 const fixture=readFileSync('tests/fixtures/permanent-deletion-base.sql','utf8').replace('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;','');
 execFileSync('psql',args,{input:fixture,stdio:['pipe','pipe','pipe']});
 execFileSync('psql',args,{input:readFileSync('docs/pending-database/permanent-user-deletion.sql','utf8'),stdio:['pipe','pipe','pipe']});
}
const prep=(actor:string,target:string,action='delete')=>`SELECT public.prepare_user_deletion('${actor}','${target}','${action}')`;
suite('isolated PostgreSQL deletion integration',()=>{
 it('preserves all six rows, UUIDs, snapshots, audit and archived restoration after login deletion',()=>{
  reset();
  const before=sql(`SELECT row_to_json(r) FROM reading_entries r`);
  sql(prep(a,o));
  expect(()=>sql(`SELECT complete_user_deletion('${a}','${o}','delete')`)).toThrow();
  sql(`DELETE FROM auth.users WHERE id='${o}'`);
  expect(sql(`SELECT complete_user_deletion('${a}','${o}','delete')`)).toBe('t');
  expect(sql(`SELECT row_to_json(r) FROM reading_entries r`)).toBe(before);
  for(const [table,col] of [['reading_entries','operator_id'],['equipment_availability_entries','operator_id'],['shift_reports','operator_id'],['incidents','reported_by'],['incident_attachments','uploaded_by'],['station_notes','author_id']]) expect(sql(`SELECT count(*) FROM ${table} WHERE ${col}='${o}'`)).toBe('1');
  expect(sql(`SELECT full_name||':'||employee_no FROM historical_user_identities WHERE id='${o}'`)).toBe('Operator current:3');
  expect(sql(`SELECT count(*) FROM audit_events WHERE actor_id='${o}'`)).toBe('1');
  expect(sql(`SELECT row_data->>'operator_name' FROM deleted_items`)).toBe('Archived name');
  sql(`INSERT INTO reading_entries SELECT (row_data->>'operator_id')::uuid,row_data->>'operator_name' FROM deleted_items`);
  expect(sql(`SELECT count(*) FROM reading_entries WHERE operator_id='${o}'`)).toBe('2');
 });
 it('blocks self deletion and non-admin callers without altering active state',()=>{
  reset(); expect(()=>sql(prep(a,a))).toThrow(); expect(()=>sql(prep(o,b))).toThrow();
  expect(sql(`SELECT count(*) FROM profiles WHERE active`)).toBe('3');
 });
 it('protects last active admin from deactivation, demotion and profile deletion',()=>{
  reset(); sql(`UPDATE profiles SET active=false WHERE id='${b}'`);
  expect(()=>sql(`UPDATE profiles SET active=false WHERE id='${a}'`)).toThrow();
  expect(()=>sql(`DELETE FROM user_roles WHERE user_id='${a}' AND role='admin'`)).toThrow();
  expect(()=>sql(`DELETE FROM profiles WHERE id='${a}'`)).toThrow();
  expect(sql(`SELECT active FROM profiles WHERE id='${a}'`)).toBe('t');
 });
 it('blocks last active admin deletion when the other admin is banned',()=>{
  reset(); sql(`UPDATE auth.users SET banned_until=now()+interval '1 year' WHERE id='${b}'`);
  expect(()=>sql(prep(b,a))).toThrow();
  expect(()=>sql(`UPDATE profiles SET active=false WHERE id='${a}'`)).toThrow();
 });
 it('safely deactivates while keeping Auth and every operational row',()=>{
  reset(); sql(prep(a,o,'deactivate'));
  expect(()=>sql(`SELECT complete_user_deletion('${a}','${o}','deactivate')`)).toThrow();
  sql(`UPDATE auth.users SET banned_until=now()+interval '1 year' WHERE id='${o}'`);
  expect(sql(`SELECT complete_user_deletion('${a}','${o}','deactivate')`)).toBe('t');
  expect(sql(`SELECT count(*) FROM auth.users WHERE id='${o}'`)).toBe('1');
  expect(sql(`SELECT count(*) FROM station_notes WHERE author_id='${o}'`)).toBe('1');
 });
 it('denies anon and authenticated access to privileged prepare RPC',()=>{
  reset(); for(const role of ['anon','authenticated']) expect(()=>sql(`SET ROLE ${role}; ${prep(a,o)}`)).toThrow();
 });
 it('rejects incomplete relationship readiness before deactivating the target',()=>{
  reset(); sql('ALTER TABLE station_notes DROP CONSTRAINT station_notes_author_id_fkey');
  expect(()=>sql(prep(a,o))).toThrow(); expect(sql(`SELECT active FROM profiles WHERE id='${o}'`)).toBe('t');
 });
 it('serializes competing admin deactivations so one active admin survives',async()=>{
  reset();
  const run=(query:string)=>new Promise<number|null>(resolve=>{const p=spawn('psql',[...args,'-c',query],{stdio:'ignore'});p.on('close',resolve)});
  const first=run(`BEGIN; UPDATE profiles SET active=false WHERE id='${a}'; SELECT pg_sleep(0.3); COMMIT`);
  await new Promise(resolve=>setTimeout(resolve,80));
  const second=run(`UPDATE profiles SET active=false WHERE id='${b}'`);
  const results=await Promise.all([first,second]);
  expect(results.filter(code=>code===0)).toHaveLength(1);
  expect(sql(`SELECT count(*) FROM profiles p JOIN user_roles r ON r.user_id=p.id WHERE p.active AND r.role='admin'`)).toBe('1');
 });
});
