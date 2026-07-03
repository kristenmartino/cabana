export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      ai_events: {
        Row: {
          confidence: number | null
          created_at: string
          id: number
          input: string
          input_tokens: number | null
          latency_ms: number | null
          outcome: string
          output_tokens: number | null
          parsed: Json | null
          prompt_version: string
          raw_output: string | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          id?: never
          input: string
          input_tokens?: number | null
          latency_ms?: number | null
          outcome: string
          output_tokens?: number | null
          parsed?: Json | null
          prompt_version: string
          raw_output?: string | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          id?: never
          input?: string
          input_tokens?: number | null
          latency_ms?: number | null
          outcome?: string
          output_tokens?: number | null
          parsed?: Json | null
          prompt_version?: string
          raw_output?: string | null
        }
        Relationships: []
      }
      app_config: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      booking_transitions: {
        Row: {
          actor: string
          at: string
          booking_id: string
          from_status: string | null
          id: number
          to_status: string
        }
        Insert: {
          actor: string
          at?: string
          booking_id: string
          from_status?: string | null
          id?: never
          to_status: string
        }
        Update: {
          actor?: string
          at?: string
          booking_id?: string
          from_status?: string | null
          id?: never
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_transitions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          business_id: string
          created_at: string
          deposit_required: boolean
          external_invoice_ref: string | null
          id: string
          kind: string
          member_id: string
          property_id: string
          request_text: string | null
          status: string
          tech_id: string | null
          triage: Json | null
          visit_notes: string | null
          window: unknown
        }
        Insert: {
          business_id: string
          created_at?: string
          deposit_required?: boolean
          external_invoice_ref?: string | null
          id?: string
          kind: string
          member_id: string
          property_id: string
          request_text?: string | null
          status?: string
          tech_id?: string | null
          triage?: Json | null
          visit_notes?: string | null
          window?: unknown
        }
        Update: {
          business_id?: string
          created_at?: string
          deposit_required?: boolean
          external_invoice_ref?: string | null
          id?: string
          kind?: string
          member_id?: string
          property_id?: string
          request_text?: string | null
          status?: string
          tech_id?: string | null
          triage?: Json | null
          visit_notes?: string | null
          window?: unknown
        }
        Relationships: [
          {
            foreignKeyName: "bookings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_tech_id_fkey"
            columns: ["tech_id"]
            isOneToOne: false
            referencedRelation: "techs"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          created_at: string
          id: string
          name: string
          tz: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          tz?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          tz?: string
        }
        Relationships: []
      }
      dead_letters: {
        Row: {
          created_at: string
          error: string | null
          id: number
          outbox_id: number | null
          payload: Json | null
          resolved_at: string | null
          workflow: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: never
          outbox_id?: number | null
          payload?: Json | null
          resolved_at?: string | null
          workflow?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: never
          outbox_id?: number | null
          payload?: Json | null
          resolved_at?: string | null
          workflow?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dead_letters_outbox_id_fkey"
            columns: ["outbox_id"]
            isOneToOne: false
            referencedRelation: "outbox"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          business_id: string
          created_at: string
          email: string
          full_name: string
          id: string
          phone: string | null
          user_id: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          email: string
          full_name: string
          id?: string
          phone?: string | null
          user_id?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          phone?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "members_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          external_billing_ref: string | null
          member_id: string
          plan_id: string
          property_id: string
          started_on: string
        }
        Insert: {
          external_billing_ref?: string | null
          member_id: string
          plan_id: string
          property_id: string
          started_on?: string
        }
        Update: {
          external_billing_ref?: string | null
          member_id?: string
          plan_id?: string
          property_id?: string
          started_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      outbox: {
        Row: {
          attempts: number
          created_at: string
          dedupe_key: string
          id: number
          last_error: string | null
          payload: Json
          processed_at: string | null
          topic: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          dedupe_key: string
          id?: never
          last_error?: string | null
          payload: Json
          processed_at?: string | null
          topic: string
        }
        Update: {
          attempts?: number
          created_at?: string
          dedupe_key?: string
          id?: never
          last_error?: string | null
          payload?: Json
          processed_at?: string | null
          topic?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount_cents: number
          booking_id: string
          created_at: string
          id: string
          status: string
          stripe_checkout_session_id: string | null
          updated_at: string
        }
        Insert: {
          amount_cents: number
          booking_id: string
          created_at?: string
          id?: string
          status?: string
          stripe_checkout_session_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          booking_id?: string
          created_at?: string
          id?: string
          status?: string
          stripe_checkout_session_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          id: string
          name: string
          weekly_day: number
        }
        Insert: {
          id?: string
          name: string
          weekly_day: number
        }
        Update: {
          id?: string
          name?: string
          weekly_day?: number
        }
        Relationships: []
      }
      properties: {
        Row: {
          access_notes: string | null
          access_notes_updated_at: string | null
          access_notes_updated_by: string | null
          address: string
          created_at: string
          id: string
          member_id: string
          zip: string
        }
        Insert: {
          access_notes?: string | null
          access_notes_updated_at?: string | null
          access_notes_updated_by?: string | null
          address: string
          created_at?: string
          id?: string
          member_id: string
          zip: string
        }
        Update: {
          access_notes?: string | null
          access_notes_updated_at?: string | null
          access_notes_updated_by?: string | null
          address?: string
          created_at?: string
          id?: string
          member_id?: string
          zip?: string
        }
        Relationships: [
          {
            foreignKeyName: "properties_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      service_zips: {
        Row: {
          note: string | null
          zip: string
        }
        Insert: {
          note?: string | null
          zip: string
        }
        Update: {
          note?: string | null
          zip?: string
        }
        Relationships: []
      }
      stripe_events: {
        Row: {
          id: string
          payload: Json
          processed_at: string | null
          received_at: string
          type: string
        }
        Insert: {
          id: string
          payload: Json
          processed_at?: string | null
          received_at?: string
          type: string
        }
        Update: {
          id?: string
          payload?: Json
          processed_at?: string | null
          received_at?: string
          type?: string
        }
        Relationships: []
      }
      sync_log: {
        Row: {
          airtable_record_id: string | null
          at: string
          direction: string
          entity: string
          entity_id: string | null
          id: number
          result: string
        }
        Insert: {
          airtable_record_id?: string | null
          at?: string
          direction: string
          entity: string
          entity_id?: string | null
          id?: never
          result: string
        }
        Update: {
          airtable_record_id?: string | null
          at?: string
          direction?: string
          entity?: string
          entity_id?: string | null
          id?: never
          result?: string
        }
        Relationships: []
      }
      techs: {
        Row: {
          active: boolean
          business_id: string
          display_name: string
          id: string
          telegram_chat_id: number | null
        }
        Insert: {
          active?: boolean
          business_id: string
          display_name: string
          id?: string
          telegram_chat_id?: number | null
        }
        Update: {
          active?: boolean
          business_id?: string
          display_name?: string
          id?: string
          telegram_chat_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "techs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_chats: {
        Row: {
          chat_id: number
          label: string
          role: string
        }
        Insert: {
          chat_id: number
          label: string
          role: string
        }
        Update: {
          chat_id?: number
          label?: string
          role?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      set_actor: { Args: { actor: string }; Returns: undefined }
      transition_booking: {
        Args: { p_actor: string; p_booking_id: string; p_to_status: string }
        Returns: {
          business_id: string
          created_at: string
          deposit_required: boolean
          external_invoice_ref: string | null
          id: string
          kind: string
          member_id: string
          property_id: string
          request_text: string | null
          status: string
          tech_id: string | null
          triage: Json | null
          visit_notes: string | null
          window: unknown
        }
        SetofOptions: {
          from: "*"
          to: "bookings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

