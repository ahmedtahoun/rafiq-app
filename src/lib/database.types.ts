/**
 * Typed schema for the Supabase database defined in
 * supabase/migrations/0001_init.sql.
 *
 * HAND-WRITTEN, and only until a real project exists. Once one does, replace
 * this whole file with the generated article and never edit it by hand again:
 *
 *   npx supabase gen types typescript --project-id <ref> > src/lib/database.types.ts
 *
 * It follows the generator's exact shape (Row/Insert/Update/Relationships per
 * table, plus Enums) so that swap is a straight overwrite, not a refactor.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          role: Database['public']['Enums']['app_role'];
          full_name: string;
          email: string | null;
          phone: string | null;
          country_code: string | null;
          country: string | null;
          country_flag: string | null;
          city: string | null;
          avatar_photo_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          role: Database['public']['Enums']['app_role'];
          full_name?: string;
          email?: string | null;
          phone?: string | null;
          country_code?: string | null;
          country?: string | null;
          country_flag?: string | null;
          city?: string | null;
          avatar_photo_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
        Relationships: [];
      };
      coach_profiles: {
        Row: {
          profile_id: string;
          title: string;
          cert: string;
          bio: string;
          languages: string[];
          session_mode: Database['public']['Enums']['session_mode'];
          experience_years: number | null;
          certifications: string[];
          cover_photo_url: string | null;
          verification_status: Database['public']['Enums']['verification_status'];
          signup_completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          profile_id: string;
          title?: string;
          cert?: string;
          bio?: string;
          languages?: string[];
          session_mode?: Database['public']['Enums']['session_mode'];
          experience_years?: number | null;
          certifications?: string[];
          cover_photo_url?: string | null;
          verification_status?: Database['public']['Enums']['verification_status'];
          signup_completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['coach_profiles']['Insert']>;
        Relationships: [];
      };
      subscriptions: {
        Row: {
          coach_id: string;
          tier: Database['public']['Enums']['subscription_tier'];
          renews_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          coach_id: string;
          tier?: Database['public']['Enums']['subscription_tier'];
          renews_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['subscriptions']['Insert']>;
        Relationships: [];
      };
      clients: {
        Row: {
          id: string;
          coach_id: string;
          member_id: string | null;
          full_name: string;
          program: string;
          plan: string;
          initials: string;
          avatar_bg: string;
          active: boolean;
          progress: number;
          needs_checkin: boolean;
          next_session_at: string | null;
          payment_status: Database['public']['Enums']['payment_status'];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          coach_id: string;
          member_id?: string | null;
          full_name: string;
          program?: string;
          plan?: string;
          initials?: string;
          avatar_bg?: string;
          active?: boolean;
          progress?: number;
          needs_checkin?: boolean;
          next_session_at?: string | null;
          payment_status?: Database['public']['Enums']['payment_status'];
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['clients']['Insert']>;
        Relationships: [];
      };
      tasks: {
        Row: {
          id: string;
          client_id: string;
          title: string;
          due_at: string | null;
          recurring: boolean;
          done: boolean;
          done_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          title: string;
          due_at?: string | null;
          recurring?: boolean;
          done?: boolean;
          done_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['tasks']['Insert']>;
        Relationships: [];
      };
      packages: {
        Row: {
          client_id: string;
          total: number;
          used: number;
          expires_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          client_id: string;
          total?: number;
          used?: number;
          expires_at: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['packages']['Insert']>;
        Relationships: [];
      };
      sessions: {
        Row: {
          id: string;
          client_id: string;
          scheduled_at: string;
          ended_at: string | null;
          attendance: Database['public']['Enums']['attendance'] | null;
          followed_up: boolean;
          recap: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          scheduled_at: string;
          ended_at?: string | null;
          attendance?: Database['public']['Enums']['attendance'] | null;
          followed_up?: boolean;
          recap?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['sessions']['Insert']>;
        Relationships: [];
      };
      payments: {
        Row: {
          id: string;
          client_id: string;
          kind: Database['public']['Enums']['payment_kind'];
          amount: number;
          currency: string;
          state: Database['public']['Enums']['payment_state'];
          method: string | null;
          note: string | null;
          refund_of: string | null;
          paid_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          kind?: Database['public']['Enums']['payment_kind'];
          amount: number;
          currency?: string;
          state?: Database['public']['Enums']['payment_state'];
          method?: string | null;
          note?: string | null;
          refund_of?: string | null;
          paid_at?: string;
          created_at?: string;
        };
        /** Ledger rows are insert-only — the table grants no UPDATE. Present
            for shape parity with the generator's output, not for use. */
        Update: Partial<Database['public']['Tables']['payments']['Insert']>;
        Relationships: [];
      };
      time_blocks: {
        Row: {
          id: string;
          coach_id: string;
          client_id: string | null;
          kind: Database['public']['Enums']['time_block_kind'];
          label: string | null;
          starts_at: string;
          ends_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          coach_id: string;
          client_id?: string | null;
          kind: Database['public']['Enums']['time_block_kind'];
          label?: string | null;
          starts_at: string;
          ends_at: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['time_blocks']['Insert']>;
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          client_id: string;
          sender_role: Database['public']['Enums']['app_role'];
          sender_id: string | null;
          body: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          sender_role: Database['public']['Enums']['app_role'];
          sender_id?: string | null;
          body: string;
          created_at?: string;
        };
        /** Append-only, same as payments. */
        Update: Partial<Database['public']['Tables']['messages']['Insert']>;
        Relationships: [];
      };
      message_reads: {
        Row: {
          client_id: string;
          reader_role: Database['public']['Enums']['app_role'];
          last_read_at: string;
        };
        Insert: {
          client_id: string;
          reader_role: Database['public']['Enums']['app_role'];
          last_read_at?: string;
        };
        Update: Partial<Database['public']['Tables']['message_reads']['Insert']>;
        Relationships: [];
      };
      ratings: {
        Row: {
          client_id: string;
          coach_id: string;
          rating: number;
          comment: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          client_id: string;
          coach_id: string;
          rating: number;
          comment?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['ratings']['Insert']>;
        Relationships: [];
      };
      offerings: {
        Row: {
          id: string;
          coach_id: string;
          name: string;
          description: string;
          session_count: number;
          price: number;
          currency: string;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          coach_id: string;
          name: string;
          description?: string;
          session_count?: number;
          price: number;
          currency?: string;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['offerings']['Insert']>;
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          recipient_id: string;
          kind: Database['public']['Enums']['notification_kind'];
          client_id: string | null;
          payload: Json;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          recipient_id: string;
          kind: Database['public']['Enums']['notification_kind'];
          client_id?: string | null;
          payload?: Json;
          read_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['notifications']['Insert']>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      is_coach_of: { Args: { p_client: string }; Returns: boolean };
      is_member_of: { Args: { p_client: string }; Returns: boolean };
      can_see_client: { Args: { p_client: string }; Returns: boolean };
    };
    Enums: {
      app_role: 'coach' | 'client';
      payment_status: 'paid' | 'due' | 'overdue';
      payment_kind: 'charge' | 'refund';
      payment_state: 'completed' | 'pending' | 'refunded';
      session_mode: 'online' | 'in_person' | 'both';
      verification_status: 'unverified' | 'pending' | 'verified';
      subscription_tier: 'free' | 'pro';
      attendance: 'attended' | 'no_show' | 'cancelled' | 'disputed';
      time_block_kind: 'available' | 'busy' | 'pending' | 'booked';
      notification_kind: 'session-request' | 'payment-received' | 'task-completed' | 'message';
    };
    CompositeTypes: { [_ in never]: never };
  };
}

/** Shorthands, so callers write `Row<'clients'>` instead of the full path. */
export type Tables = Database['public']['Tables'];
export type Row<T extends keyof Tables> = Tables[T]['Row'];
export type Insert<T extends keyof Tables> = Tables[T]['Insert'];
export type Update<T extends keyof Tables> = Tables[T]['Update'];
export type Enums<T extends keyof Database['public']['Enums']> = Database['public']['Enums'][T];
