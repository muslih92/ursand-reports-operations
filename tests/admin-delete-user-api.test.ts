import { describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({getUser:vi.fn(),manage:vi.fn(),tryAdmin:vi.fn()}));
vi.mock('@tanstack/react-router',()=>({createFileRoute:()=> (options:unknown)=>options}));
vi.mock('@supabase/supabase-js',()=>({createClient:()=>({auth:{getUser:mocks.getUser}})}));
vi.mock('@/lib/user-deletion.server',()=>({manageUserDeletion:mocks.manage}));
vi.mock('@/lib/users.server',()=>({tryAdmin:mocks.tryAdmin}));
import { Route } from '@/routes/api/public/admin-delete-user';
const handler=(Route as unknown as {server:{handlers:{POST:(args:{request:Request})=>Promise<Response>}}}).server.handlers.POST;
describe('receiving deletion endpoint authentication',()=>{
 it('rejects missing Authorization without privileged access',async()=>{
  const response=await handler({request:new Request('https://example.test/api/public/admin-delete-user',{method:'POST',body:'{}'})});
  expect(response.status).toBe(401); expect(mocks.manage).not.toHaveBeenCalled();
 });
 it('rejects invalid caller JWT before deletion management',async()=>{
  vi.stubEnv('SUPABASE_URL','https://example.test'); vi.stubEnv('SUPABASE_PUBLISHABLE_KEY','public-test');
  mocks.getUser.mockResolvedValue({data:{user:null},error:{message:'invalid'}});
  const response=await handler({request:new Request('https://example.test/api/public/admin-delete-user',{method:'POST',headers:{Authorization:'Bearer fake-test-token'},body:'{}'})});
  expect(response.status).toBe(401); expect(mocks.manage).not.toHaveBeenCalled(); vi.unstubAllEnvs();
 });
 it('preserves accurate receiving-server rejection status for verified callers',async()=>{
  vi.stubEnv('SUPABASE_URL','https://example.test'); vi.stubEnv('SUPABASE_PUBLISHABLE_KEY','public-test');
  mocks.getUser.mockResolvedValue({data:{user:{id:'10000000-0000-4000-8000-000000000001'}},error:null});
  mocks.manage.mockResolvedValue({status:403,body:{ok:false,code:'FORBIDDEN',message:'Admin only'}});
  const response=await handler({request:new Request('https://example.test/api/public/admin-delete-user',{method:'POST',headers:{Authorization:'Bearer fake-test-token'},body:JSON.stringify({user_id:'10000000-0000-4000-8000-000000000002'})})});
  expect(response.status).toBe(403); expect((await response.json()).ok).toBe(false);
  expect(response.headers.get('cache-control')).toBe('no-store'); vi.unstubAllEnvs();
 });
});
