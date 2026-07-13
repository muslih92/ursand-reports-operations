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
      equipment_availability_entries: {
        Row: {
          created_at: string
          entry_date: string
          id: string
          notes: string | null
          operator_id: string | null
          operator_name: string | null
          station_id: string
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
          id: string
          remark: string | null
          status: Database["public"]["Enums"]["equipment_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          entry_id: string
          equipment_id: string
          id?: string
          remark?: string | null
          status: Database["public"]["Enums"]["equipment_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          entry_id?: string
          equipment_id?: string
          id?: string
          remark?: string | null
          status?: Database["public"]["Enums"]["equipment_status"]
          updated_at?: string
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
          time_slot: string
          updated_at: string
          value: number | null
        }
        Insert: {
          created_at?: string
          entry_id: string
          field_id: string
          id?: string
          time_slot: string
          updated_at?: string
          value?: number | null
        }
        Update: {
          created_at?: string
          entry_id?: string
          field_id?: string
          id?: string
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
      get_user_station: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "supervisor" | "operator" | "viewer"
      equipment_status:
        | "in_service"
        | "standby"
        | "out_of_service"
        | "fixed_speed"
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
      app_role: ["admin", "supervisor", "operator", "viewer"],
      equipment_status: [
        "in_service",
        "standby",
        "out_of_service",
        "fixed_speed",
      ],
      incident_severity: ["low", "medium", "high", "critical"],
      incident_status: ["open", "in_progress", "closed"],
      reading_frequency: ["hourly", "every_2h", "every_6h", "every_4h"],
    },
  },
} as const
