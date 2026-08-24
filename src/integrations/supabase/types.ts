export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_events: {
        Row: {
          actor_id: string | null
          details: Json
          entity_id: string | null
          entity_table: string | null
          event_type: string
          id: string
          occurred_at: string
          station_id: string | null
        }
        Insert: {
          actor_id?: string | null
          details?: Json
          entity_id?: string | null
          entity_table?: string | null
          event_type: string
          id?: string
          occurred_at?: string
          station_id?: string | null
        }
        Update: {
          actor_id?: string | null
          details?: Json
          entity_id?: string | null
          entity_table?: string | null
          event_type?: string
          id?: string
          occurred_at?: string
          station_id?: string | null
        }
        Relationships: []
      }
      equipment_availability_entries: {
        Row: {
          created_at: string
          entry_date: string
          id: string
          notes: string | null
          operator_id: string | null
          operator_name: string | null
          report_status: string
          shift: string | null
          station_id: string
          supervisor_id: string | null
          supervisor_name: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          entry_date: string
          id?: string
          notes?: string | null
          operator_id?: string | null
          operator_name?: string | null
          report_status?: string
          shift?: string | null
          station_id: string
          supervisor_id?: string | null
          supervisor_name?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          entry_date?: string
          id?: string
          notes?: string | null
          operator_id?: string | null
          operator_name?: string | null
          report_status?: string
          shift?: string | null
          station_id?: string
          supervisor_id?: string | null
          supervisor_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_availability_entries_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_availability_values: {
        Row: {
          created_at: string
          entry_id: string
          equipment_id: string
          ets: string | null
          id: string
          notification_date: string | null
          problem_description: string | null
          remark: string | null
          status: Database["public"]["Enums"]["equipment_status"]
          updated_at: string
          work_center: string | null
          work_notification: string | null
        }
        Insert: {
          created_at?: string
          entry_id: string
          equipment_id: string
          ets?: string | null
          id?: string
          notification_date?: string | null
          problem_description?: string | null
          remark?: string | null
          status: Database["public"]["Enums"]["equipment_status"]
          updated_at?: string
          work_center?: string | null
          work_notification?: string | null
        }
        Update: {
          created_at?: string
          entry_id?: string
          equipment_id?: string
          ets?: string | null
          id?: string
          notification_date?: string | null
          problem_description?: string | null
          remark?: string | null
          status?: Database["public"]["Enums"]["equipment_status"]
          updated_at?: string
          work_center?: string | null
          work_notification?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_availability_values_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "equipment_availability_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_availability_values_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "station_equipment"
            referencedColumns: ["id"]
          },
        ]
      }
      fire_pump_tests: {
        Row: {
          created_at: string
          created_by: string | null
          data: Json
          id: string
          operator_id: string | null
          operator_name: string | null
          pump_tag: string | null
          station_id: string
          supervisor_name: string | null
          supervisor_notes: string | null
          test_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data?: Json
          id?: string
          operator_id?: string | null
          operator_name?: string | null
          pump_tag?: string | null
          station_id: string
          supervisor_name?: string | null
          supervisor_notes?: string | null
          test_date?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data?: Json
          id?: string
          operator_id?: string | null
          operator_name?: string | null
          pump_tag?: string | null
          station_id?: string
          supervisor_name?: string | null
          supervisor_notes?: string | null
          test_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fire_pump_tests_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      generator_tests: {
        Row: {
          created_at: string
          created_by: string | null
          data: Json
          genset_tag: string | null
          id: string
          operator_id: string | null
          operator_name: string | null
          station_id: string
          supervisor_name: string | null
          supervisor_notes: string | null
          test_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data?: Json
          genset_tag?: string | null
          id?: string
          operator_id?: string | null
          operator_name?: string | null
          station_id: string
          supervisor_name?: string | null
          supervisor_notes?: string | null
          test_date?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data?: Json
          genset_tag?: string | null
          id?: string
          operator_id?: string | null
          operator_name?: string | null
          station_id?: string
          supervisor_name?: string | null
          supervisor_notes?: string | null
          test_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "generator_tests_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_attachments: {
        Row: {
          content_type: string | null
          created_at: string
          file_name: string
          id: string
          incident_id: string
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          content_type?: string | null
          created_at?: string
          file_name: string
          id?: string
          incident_id: string
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          content_type?: string | null
          created_at?: string
          file_name?: string
          id?: string
          incident_id?: string
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incident_attachments_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      incidents: {
        Row: {
          action_taken: string | null
          closed_at: string | null
          created_at: string
          description: string
          equipment: string
          id: string
          incident_no: string | null
          occurred_at: string
          report_data: Json
          reported_by: string | null
          reporter_name: string | null
          root_cause: string | null
          severity: Database["public"]["Enums"]["incident_severity"]
          station_id: string
          status: Database["public"]["Enums"]["incident_status"]
          title: string
          updated_at: string
        }
        Insert: {
          action_taken?: string | null
          closed_at?: string | null
          created_at?: string
          description: string
          equipment: string
          id?: string
          incident_no?: string | null
          occurred_at?: string
          report_data?: Json
          reported_by?: string | null
          reporter_name?: string | null
          root_cause?: string | null
          severity?: Database["public"]["Enums"]["incident_severity"]
          station_id: string
          status?: Database["public"]["Enums"]["incident_status"]
          title: string
          updated_at?: string
        }
        Update: {
          action_taken?: string | null
          closed_at?: string | null
          created_at?: string
          description?: string
          equipment?: string
          id?: string
          incident_no?: string | null
          occurred_at?: string
          report_data?: Json
          reported_by?: string | null
          reporter_name?: string | null
          root_cause?: string | null
          severity?: Database["public"]["Enums"]["incident_severity"]
          station_id?: string
          status?: Database["public"]["Enums"]["incident_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "incidents_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: string
          link: string | null
          read: boolean
          station_id: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind: string
          link?: string | null
          read?: boolean
          station_id?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          link?: string | null
          read?: boolean
          station_id?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_stations: {
        Row: {
          created_at: string
          id: string
          station_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          station_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          station_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_stations_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          employee_no: string
          full_name: string
          id: string
          phone: string | null
          station_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          employee_no: string
          full_name: string
          id: string
          phone?: string | null
          station_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          employee_no?: string
          full_name?: string
          id?: string
          phone?: string | null
          station_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      reading_entries: {
        Row: {
          created_at: string
          entry_date: string
          id: string
          notes: string | null
          operator_id: string | null
          operator_name: string | null
          station_id: string
          template_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          entry_date: string
          id?: string
          notes?: string | null
          operator_id?: string | null
          operator_name?: string | null
          station_id: string
          template_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          entry_date?: string
          id?: string
          notes?: string | null
          operator_id?: string | null
          operator_name?: string | null
          station_id?: string
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reading_entries_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reading_entries_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "reading_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      reading_fields: {
        Row: {
          created_at: string
          id: string
          label_ar: string | null
          label_en: string
          max_value: number | null
          min_value: number | null
          section_id: string | null
          sort_order: number
          template_id: string
          unit: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          label_ar?: string | null
          label_en: string
          max_value?: number | null
          min_value?: number | null
          section_id?: string | null
          sort_order?: number
          template_id: string
          unit?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          label_ar?: string | null
          label_en?: string
          max_value?: number | null
          min_value?: number | null
          section_id?: string | null
          sort_order?: number
          template_id?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reading_fields_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "reading_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reading_fields_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "reading_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      reading_sections: {
        Row: {
          created_at: string
          id: string
          name_ar: string | null
          name_en: string
          sort_order: number
          template_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name_ar?: string | null
          name_en: string
          sort_order?: number
          template_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name_ar?: string | null
          name_en?: string
          sort_order?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reading_sections_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "reading_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      reading_templates: {
        Row: {
          active: boolean
          code: string
          created_at: string
          frequency: Database["public"]["Enums"]["reading_frequency"]
          id: string
          name_ar: string
          name_en: string
          station_id: string | null
          time_slots: string[]
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          frequency: Database["public"]["Enums"]["reading_frequency"]
          id?: string
          name_ar: string
          name_en: string
          station_id?: string | null
          time_slots?: string[]
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          frequency?: Database["public"]["Enums"]["reading_frequency"]
          id?: string
          name_ar?: string
          name_en?: string
          station_id?: string | null
          time_slots?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "reading_templates_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      reading_values: {
        Row: {
          created_at: string
          entry_id: string
          field_id: string
          id: string
          recorded_at: string | null
          status: string | null
          time_slot: string
          updated_at: string
          value: number | null
        }
        Insert: {
          created_at?: string
          entry_id: string
          field_id: string
          id?: string
          recorded_at?: string | null
          status?: string | null
          time_slot: string
          updated_at?: string
          value?: number | null
        }
        Update: {
          created_at?: string
          entry_id?: string
          field_id?: string
          id?: string
          recorded_at?: string | null
          status?: string | null
          time_slot?: string
          updated_at?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reading_values_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "reading_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reading_values_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "reading_fields"
            referencedColumns: ["id"]
          },
        ]
      }
      scada_parameters: {
        Row: {
          active: boolean
          created_at: string
          equipment_label: string | null
          equipment_no: number
          equipment_type: string
          group_key: string
          hh: number | null
          hi: number | null
          id: string
          limit_mode: string
          ll: number | null
          lo: number | null
          max_value: number | null
          min_value: number | null
          name_ar: string | null
          name_en: string
          param_key: string
          reference_value: number | null
          scada_tag: string | null
          sort_order: number
          station_id: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          equipment_label?: string | null
          equipment_no?: number
          equipment_type?: string
          group_key: string
          hh?: number | null
          hi?: number | null
          id?: string
          limit_mode?: string
          ll?: number | null
          lo?: number | null
          max_value?: number | null
          min_value?: number | null
          name_ar?: string | null
          name_en: string
          param_key: string
          reference_value?: number | null
          scada_tag?: string | null
          sort_order?: number
          station_id: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          equipment_label?: string | null
          equipment_no?: number
          equipment_type?: string
          group_key?: string
          hh?: number | null
          hi?: number | null
          id?: string
          limit_mode?: string
          ll?: number | null
          lo?: number | null
          max_value?: number | null
          min_value?: number | null
          name_ar?: string | null
          name_en?: string
          param_key?: string
          reference_value?: number | null
          scada_tag?: string | null
          sort_order?: number
          station_id?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scada_parameters_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      scada_samples: {
        Row: {
          created_at: string
          id: string
          parameter_id: string
          recorded_by: string | null
          station_id: string
          ts: string
          value: number
        }
        Insert: {
          created_at?: string
          id?: string
          parameter_id: string
          recorded_by?: string | null
          station_id: string
          ts?: string
          value: number
        }
        Update: {
          created_at?: string
          id?: string
          parameter_id?: string
          recorded_by?: string | null
          station_id?: string
          ts?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "scada_samples_parameter_id_fkey"
            columns: ["parameter_id"]
            isOneToOne: false
            referencedRelation: "scada_parameters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scada_samples_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_reports: {
        Row: {
          created_at: string
          id: string
          lines: Json
          operator_id: string | null
          remarks: string[]
          report_date: string
          reported_by: string | null
          shift: string
          station_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          lines?: Json
          operator_id?: string | null
          remarks?: string[]
          report_date: string
          reported_by?: string | null
          shift: string
          station_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          lines?: Json
          operator_id?: string | null
          remarks?: string[]
          report_date?: string
          reported_by?: string | null
          shift?: string
          station_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_reports_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      station_equipment: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          name_ar: string
          name_en: string
          sort_order: number
          station_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          name_ar: string
          name_en: string
          sort_order?: number
          station_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          name_ar?: string
          name_en?: string
          sort_order?: number
          station_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "station_equipment_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      station_messages: {
        Row: {
          audience_roles: string[] | null
          author_id: string | null
          author_name: string | null
          author_role: string | null
          body: string
          created_at: string
          id: string
          parent_id: string | null
          station_id: string
          subject: string | null
          target_station_ids: string[] | null
          target_user_ids: string[] | null
        }
        Insert: {
          audience_roles?: string[] | null
          author_id?: string | null
          author_name?: string | null
          author_role?: string | null
          body: string
          created_at?: string
          id?: string
          parent_id?: string | null
          station_id: string
          subject?: string | null
          target_station_ids?: string[] | null
          target_user_ids?: string[] | null
        }
        Update: {
          audience_roles?: string[] | null
          author_id?: string | null
          author_name?: string | null
          author_role?: string | null
          body?: string
          created_at?: string
          id?: string
          parent_id?: string | null
          station_id?: string
          subject?: string | null
          target_station_ids?: string[] | null
          target_user_ids?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "station_messages_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "station_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "station_messages_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      stations: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          location: string | null
          name_ar: string
          name_en: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          location?: string | null
          name_ar: string
          name_en: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          location?: string | null
          name_ar?: string
          name_en?: string
        }
        Relationships: []
      }
      supervisor_routines: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          items: Json
          notes: string | null
          routine_date: string
          station_id: string
          supervisor_id: string | null
          supervisor_name: string | null
          updated_at: string
          weekday: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          items?: Json
          notes?: string | null
          routine_date: string
          station_id: string
          supervisor_id?: string | null
          supervisor_name?: string | null
          updated_at?: string
          weekday: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          items?: Json
          notes?: string | null
          routine_date?: string
          station_id?: string
          supervisor_id?: string | null
          supervisor_name?: string | null
          updated_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "supervisor_routines_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_station: {
        Args: { _station_id: string; _user_id: string }
        Returns: boolean
      }
      can_view_station_message: {
        Args: {
          _author: string
          _roles: string[]
          _station: string
          _stations: string[]
          _user: string
          _users: string[]
        }
        Returns: boolean
      }
      get_user_station: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_unrestricted_viewer: { Args: { _user_id: string }; Returns: boolean }
      list_message_recipients: {
        Args: never
        Returns: {
          employee_no: string
          full_name: string
          role: string
          station_id: string
          user_id: string
        }[]
      }
      log_audit_event: {
        Args: {
          _details?: Json
          _entity_id?: string
          _entity_table?: string
          _event_type: string
          _station_id?: string
        }
        Returns: undefined
      }
      notify_station: {
        Args: {
          _body: string
          _include_operators?: boolean
          _kind: string
          _link?: string
          _station_id: string
          _title: string
        }
        Returns: number
      }
      notify_station_roles: {
        Args: {
          _body: string
          _kind: string
          _link?: string
          _roles?: string[]
          _station_id: string
          _title: string
        }
        Returns: number
      }
      notify_stations_roles: {
        Args: {
          _body: string
          _kind: string
          _link?: string
          _roles?: string[]
          _station_ids: string[]
          _title: string
        }
        Returns: number
      }
      notify_users: {
        Args: {
          _body?: string
          _kind: string
          _link?: string
          _station_id: string
          _title: string
          _user_ids: string[]
        }
        Returns: number
      }
      security_test_report: {
        Args: never
        Returns: {
          detail: string
          expectation: string
          passed: boolean
          scenario: string
        }[]
      }
      staff_month_scores: {
        Args: { _month?: string }
        Returns: {
          employee_no: string
          full_name: string
          m1: number
          m2: number
          m3: number
          m4: number
          month_end: string
          month_start: string
          rank: number
          role: string
          station_code: string
          total_score: number
          user_id: string
        }[]
      }
      station_week_scores: {
        Args: { _week_start?: string }
        Returns: {
          availability_score: number
          code: string
          name_ar: string
          name_en: string
          punctuality_score: number
          rank: number
          readings_score: number
          reports_score: number
          station_id: string
          systems_score: number
          total_score: number
          week_end: string
          week_start: string
        }[]
      }
      user_station: { Args: { _user_id: string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "supervisor" | "operator" | "viewer" | "management"
      equipment_status:
        | "in_service"
        | "standby"
        | "out_of_service"
        | "fixed_speed"
        | "maintenance"
        | "not_available"
        | "shutdown"
        | "testing"
        | "emergency_standby"
        | "standby_fixed_speed"
        | "in_service_fixed_speed"
        | "running_on_emergency"
      incident_severity: "low" | "medium" | "high" | "critical"
      incident_status: "open" | "in_progress" | "closed"
      reading_frequency: "hourly" | "every_2h" | "every_6h" | "every_4h"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "supervisor", "operator", "viewer", "management"],
      equipment_status: [
        "in_service",
        "standby",
        "out_of_service",
        "fixed_speed",
        "maintenance",
        "not_available",
        "shutdown",
        "testing",
        "emergency_standby",
        "standby_fixed_speed",
        "in_service_fixed_speed",
        "running_on_emergency",
      ],
      incident_severity: ["low", "medium", "high", "critical"],
      incident_status: ["open", "in_progress", "closed"],
      reading_frequency: ["hourly", "every_2h", "every_6h", "every_4h"],
    },
  },
} as const
