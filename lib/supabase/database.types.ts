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
      ai_analyses: {
        Row: {
          confidence: string
          confidence_rationale: string | null
          created_at: string
          created_by: string | null
          disclaimer: string
          evidence_refs: Json | null
          id: string
          incident_id: string
          interpretation: string
          is_demo: boolean
          model: string | null
          observation: string
          provider: string | null
          raw: Json | null
          suggested_action: string | null
        }
        Insert: {
          confidence?: string
          confidence_rationale?: string | null
          created_at?: string
          created_by?: string | null
          disclaimer?: string
          evidence_refs?: Json | null
          id?: string
          incident_id: string
          interpretation: string
          is_demo?: boolean
          model?: string | null
          observation: string
          provider?: string | null
          raw?: Json | null
          suggested_action?: string | null
        }
        Update: {
          confidence?: string
          confidence_rationale?: string | null
          created_at?: string
          created_by?: string | null
          disclaimer?: string
          evidence_refs?: Json | null
          id?: string
          incident_id?: string
          interpretation?: string
          is_demo?: boolean
          model?: string | null
          observation?: string
          provider?: string | null
          raw?: Json | null
          suggested_action?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_analyses_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_events: {
        Row: {
          actor: string
          at: string
          id: string
          incident_id: string
          is_demo: boolean
          kind: string
          message: string
          metadata: Json | null
        }
        Insert: {
          actor?: string
          at?: string
          id?: string
          incident_id: string
          is_demo?: boolean
          kind?: string
          message: string
          metadata?: Json | null
        }
        Update: {
          actor?: string
          at?: string
          id?: string
          incident_id?: string
          is_demo?: boolean
          kind?: string
          message?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "incident_events_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_evidence: {
        Row: {
          created_at: string
          detail: string | null
          id: string
          incident_id: string
          is_demo: boolean
          label: string
          metadata: Json | null
          observed_at: string | null
          source: string
        }
        Insert: {
          created_at?: string
          detail?: string | null
          id?: string
          incident_id: string
          is_demo?: boolean
          label: string
          metadata?: Json | null
          observed_at?: string | null
          source?: string
        }
        Update: {
          created_at?: string
          detail?: string | null
          id?: string
          incident_id?: string
          is_demo?: boolean
          label?: string
          metadata?: Json | null
          observed_at?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "incident_evidence_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      incidents: {
        Row: {
          created_by: string | null
          detected_at: string
          id: string
          is_demo: boolean
          project_id: string
          resolved_at: string | null
          service_id: string | null
          severity: string
          status: string
          summary: string | null
          title: string
        }
        Insert: {
          created_by?: string | null
          detected_at?: string
          id?: string
          is_demo?: boolean
          project_id: string
          resolved_at?: string | null
          service_id?: string | null
          severity?: string
          status?: string
          summary?: string | null
          title: string
        }
        Update: {
          created_by?: string | null
          detected_at?: string
          id?: string
          is_demo?: boolean
          project_id?: string
          resolved_at?: string | null
          service_id?: string | null
          severity?: string
          status?: string
          summary?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "incidents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          organization_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          organization_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          organization_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_configs: {
        Row: {
          analysis: Json | null
          branch: string | null
          created_at: string
          dependencies: Json | null
          deployment: Json | null
          description: string | null
          health: Json | null
          monitoring_enabled: boolean
          monitoring_status: string
          project_id: string
          repository_provider: string | null
          runtime: Json | null
          tags: string[]
          updated_at: string
        }
        Insert: {
          analysis?: Json | null
          branch?: string | null
          created_at?: string
          dependencies?: Json | null
          deployment?: Json | null
          description?: string | null
          health?: Json | null
          monitoring_enabled?: boolean
          monitoring_status?: string
          project_id: string
          repository_provider?: string | null
          runtime?: Json | null
          tags?: string[]
          updated_at?: string
        }
        Update: {
          analysis?: Json | null
          branch?: string | null
          created_at?: string
          dependencies?: Json | null
          deployment?: Json | null
          description?: string | null
          health?: Json | null
          monitoring_enabled?: boolean
          monitoring_status?: string
          project_id?: string
          repository_provider?: string | null
          runtime?: Json | null
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_configs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_drafts: {
        Row: {
          created_at: string
          created_by: string | null
          created_project_id: string | null
          current_step: string
          draft_id: string
          id: string
          organization_id: string | null
          status: string
          updated_at: string
          wizard_state: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          created_project_id?: string | null
          current_step?: string
          draft_id: string
          id?: string
          organization_id?: string | null
          status?: string
          updated_at?: string
          wizard_state?: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          created_project_id?: string | null
          current_step?: string
          draft_id?: string
          id?: string
          organization_id?: string | null
          status?: string
          updated_at?: string
          wizard_state?: Json
        }
        Relationships: [
          {
            foreignKeyName: "project_drafts_created_project_id_fkey"
            columns: ["created_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_drafts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      project_env_vars: {
        Row: {
          created_at: string
          has_value: boolean
          id: string
          is_secret: boolean
          key: string
          project_id: string
          value: string | null
        }
        Insert: {
          created_at?: string
          has_value?: boolean
          id?: string
          is_secret?: boolean
          key: string
          project_id: string
          value?: string | null
        }
        Update: {
          created_at?: string
          has_value?: boolean
          id?: string
          is_secret?: boolean
          key?: string
          project_id?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_env_vars_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          active_incident_count: number | null
          created_at: string
          created_by: string | null
          deployed_at: string | null
          deployment_commit: string | null
          deployment_status: string | null
          deployment_version: string | null
          environment: string | null
          health: string | null
          health_warning: string | null
          id: string
          is_demo: boolean
          last_checked_at: string | null
          name: string
          organization_id: string
          repository: string | null
          service_count: number | null
          slug: string
        }
        Insert: {
          active_incident_count?: number | null
          created_at?: string
          created_by?: string | null
          deployed_at?: string | null
          deployment_commit?: string | null
          deployment_status?: string | null
          deployment_version?: string | null
          environment?: string | null
          health?: string | null
          health_warning?: string | null
          id?: string
          is_demo?: boolean
          last_checked_at?: string | null
          name: string
          organization_id: string
          repository?: string | null
          service_count?: number | null
          slug: string
        }
        Update: {
          active_incident_count?: number | null
          created_at?: string
          created_by?: string | null
          deployed_at?: string | null
          deployment_commit?: string | null
          deployment_status?: string | null
          deployment_version?: string | null
          environment?: string | null
          health?: string | null
          health_warning?: string | null
          id?: string
          is_demo?: boolean
          last_checked_at?: string | null
          name?: string
          organization_id?: string
          repository?: string | null
          service_count?: number | null
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      remediation_actions: {
        Row: {
          action_type: string | null
          ai_analysis_id: string | null
          applied_at: string | null
          approved_at: string | null
          approved_by: string | null
          command: string | null
          created_at: string
          description: string | null
          id: string
          incident_id: string
          is_demo: boolean
          proposed_by: string
          requires_approval: boolean
          result: string | null
          risk: string
          status: string
          title: string
          verified_at: string | null
        }
        Insert: {
          action_type?: string | null
          ai_analysis_id?: string | null
          applied_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          command?: string | null
          created_at?: string
          description?: string | null
          id?: string
          incident_id: string
          is_demo?: boolean
          proposed_by?: string
          requires_approval?: boolean
          result?: string | null
          risk?: string
          status?: string
          title: string
          verified_at?: string | null
        }
        Update: {
          action_type?: string | null
          ai_analysis_id?: string | null
          applied_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          command?: string | null
          created_at?: string
          description?: string | null
          id?: string
          incident_id?: string
          is_demo?: boolean
          proposed_by?: string
          requires_approval?: boolean
          result?: string | null
          risk?: string
          status?: string
          title?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "remediation_actions_ai_analysis_id_fkey"
            columns: ["ai_analysis_id"]
            isOneToOne: false
            referencedRelation: "ai_analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remediation_actions_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      service_health_checks: {
        Row: {
          checked_at: string
          detail: string | null
          error_rate: number | null
          id: string
          is_demo: boolean
          latency_ms: number | null
          metadata: Json | null
          project_id: string
          service_id: string
          source: string
          status: string
        }
        Insert: {
          checked_at?: string
          detail?: string | null
          error_rate?: number | null
          id?: string
          is_demo?: boolean
          latency_ms?: number | null
          metadata?: Json | null
          project_id: string
          service_id: string
          source?: string
          status: string
        }
        Update: {
          checked_at?: string
          detail?: string | null
          error_rate?: number | null
          id?: string
          is_demo?: boolean
          latency_ms?: number | null
          metadata?: Json | null
          project_id?: string
          service_id?: string
          source?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_health_checks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_health_checks_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_demo: boolean
          kind: string | null
          monitoring_last_check_at: string | null
          monitoring_last_error: string | null
          monitoring_last_status: string | null
          monitoring_lease_expires_at: string | null
          monitoring_next_check_at: string | null
          monitoring_run_id: string | null
          monitoring_worker_id: string | null
          name: string
          project_id: string
          status: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_demo?: boolean
          kind?: string | null
          monitoring_last_check_at?: string | null
          monitoring_last_error?: string | null
          monitoring_last_status?: string | null
          monitoring_lease_expires_at?: string | null
          monitoring_next_check_at?: string | null
          monitoring_run_id?: string | null
          monitoring_worker_id?: string | null
          name: string
          project_id: string
          status?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_demo?: boolean
          kind?: string | null
          monitoring_last_check_at?: string | null
          monitoring_last_error?: string | null
          monitoring_last_status?: string | null
          monitoring_lease_expires_at?: string | null
          monitoring_next_check_at?: string | null
          monitoring_run_id?: string | null
          monitoring_worker_id?: string | null
          name?: string
          project_id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "services_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_runs: {
        Row: {
          checks_passed: number
          checks_required: number
          completed_at: string | null
          detail: string | null
          id: string
          incident_id: string
          is_demo: boolean
          remediation_action_id: string | null
          started_at: string
          status: string
        }
        Insert: {
          checks_passed?: number
          checks_required?: number
          completed_at?: string | null
          detail?: string | null
          id?: string
          incident_id: string
          is_demo?: boolean
          remediation_action_id?: string | null
          started_at?: string
          status?: string
        }
        Update: {
          checks_passed?: number
          checks_required?: number
          completed_at?: string | null
          detail?: string | null
          id?: string
          incident_id?: string
          is_demo?: boolean
          remediation_action_id?: string | null
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "verification_runs_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_runs_remediation_action_id_fkey"
            columns: ["remediation_action_id"]
            isOneToOne: false
            referencedRelation: "remediation_actions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_incident: {
        Args: { target_incident: string }
        Returns: boolean
      }
      can_access_project: { Args: { target_project: string }; Returns: boolean }
      has_org_admin_role: { Args: { target_org: string }; Returns: boolean }
      is_org_member: { Args: { target_org: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
