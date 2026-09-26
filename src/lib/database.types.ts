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
      account_deletion_requests: {
        Row: {
          id: string
          note: string | null
          processed_at: string | null
          profile_id: string | null
          requested_at: string
          status: Database["public"]["Enums"]["deletion_status"]
        }
        Insert: {
          id?: string
          note?: string | null
          processed_at?: string | null
          profile_id?: string | null
          requested_at?: string
          status?: Database["public"]["Enums"]["deletion_status"]
        }
        Update: {
          id?: string
          note?: string | null
          processed_at?: string | null
          profile_id?: string | null
          requested_at?: string
          status?: Database["public"]["Enums"]["deletion_status"]
        }
        Relationships: [
          {
            foreignKeyName: "account_deletion_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      agreements: {
        Row: {
          client_id: string
          sent_at: string
          signed_at: string | null
          status: Database["public"]["Enums"]["agreement_status"]
          updated_at: string
        }
        Insert: {
          client_id: string
          sent_at?: string
          signed_at?: string | null
          status?: Database["public"]["Enums"]["agreement_status"]
          updated_at?: string
        }
        Update: {
          client_id?: string
          sent_at?: string
          signed_at?: string | null
          status?: Database["public"]["Enums"]["agreement_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agreements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      cancellations: {
        Row: {
          cancelled_at: string
          cancelled_by: string | null
          cancelled_by_role: Database["public"]["Enums"]["app_role"]
          client_id: string
          hours_until_session: number | null
          id: string
          reason: string | null
          time_block_id: string | null
          within_grace: boolean
        }
        Insert: {
          cancelled_at?: string
          cancelled_by?: string | null
          cancelled_by_role: Database["public"]["Enums"]["app_role"]
          client_id: string
          hours_until_session?: number | null
          id?: string
          reason?: string | null
          time_block_id?: string | null
          within_grace?: boolean
        }
        Update: {
          cancelled_at?: string
          cancelled_by?: string | null
          cancelled_by_role?: Database["public"]["Enums"]["app_role"]
          client_id?: string
          hours_until_session?: number | null
          id?: string
          reason?: string | null
          time_block_id?: string | null
          within_grace?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "cancellations_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cancellations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cancellations_time_block_id_fkey"
            columns: ["time_block_id"]
            isOneToOne: false
            referencedRelation: "time_blocks"
            referencedColumns: ["id"]
          },
        ]
      }
      client_private: {
        Row: {
          client_id: string
          is_favourite: boolean
          notes: string
          updated_at: string
        }
        Insert: {
          client_id: string
          is_favourite?: boolean
          notes?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          is_favourite?: boolean
          notes?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_private_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          active: boolean
          age: number | null
          avatar_bg: string
          city: string | null
          coach_id: string
          country_code: string | null
          created_at: string
          email: string | null
          focus: string
          full_name: string
          goal: string
          id: string
          initials: string
          member_id: string | null
          needs_checkin: boolean
          next_session_at: string | null
          next_session_type: Database["public"]["Enums"]["session_type"] | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          phone: string | null
          plan: string
          program: string
          program_completed: boolean
          progress: number
          signup_completed_at: string | null
          specialty: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          age?: number | null
          avatar_bg?: string
          city?: string | null
          coach_id: string
          country_code?: string | null
          created_at?: string
          email?: string | null
          focus?: string
          full_name: string
          goal?: string
          id?: string
          initials?: string
          member_id?: string | null
          needs_checkin?: boolean
          next_session_at?: string | null
          next_session_type?: Database["public"]["Enums"]["session_type"] | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          phone?: string | null
          plan?: string
          program?: string
          program_completed?: boolean
          progress?: number
          signup_completed_at?: string | null
          specialty?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          age?: number | null
          avatar_bg?: string
          city?: string | null
          coach_id?: string
          country_code?: string | null
          created_at?: string
          email?: string | null
          focus?: string
          full_name?: string
          goal?: string
          id?: string
          initials?: string
          member_id?: string | null
          needs_checkin?: boolean
          next_session_at?: string | null
          next_session_type?: Database["public"]["Enums"]["session_type"] | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          phone?: string | null
          plan?: string
          program?: string
          program_completed?: boolean
          progress?: number
          signup_completed_at?: string | null
          specialty?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coach_directory"
            referencedColumns: ["coach_id"]
          },
          {
            foreignKeyName: "clients_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "clients_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_profiles: {
        Row: {
          bio: string
          cert: string
          certifications: string[]
          cover_photo_url: string | null
          created_at: string
          experience_years: number | null
          featured: boolean
          languages: string[]
          profile_id: string
          session_mode: Database["public"]["Enums"]["session_mode"]
          signup_completed_at: string | null
          title: string
          updated_at: string
          verification_status: Database["public"]["Enums"]["verification_status"]
        }
        Insert: {
          bio?: string
          cert?: string
          certifications?: string[]
          cover_photo_url?: string | null
          created_at?: string
          experience_years?: number | null
          featured?: boolean
          languages?: string[]
          profile_id: string
          session_mode?: Database["public"]["Enums"]["session_mode"]
          signup_completed_at?: string | null
          title?: string
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["verification_status"]
        }
        Update: {
          bio?: string
          cert?: string
          certifications?: string[]
          cover_photo_url?: string | null
          created_at?: string
          experience_years?: number | null
          featured?: boolean
          languages?: string[]
          profile_id?: string
          session_mode?: Database["public"]["Enums"]["session_mode"]
          signup_completed_at?: string | null
          title?: string
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["verification_status"]
        }
        Relationships: [
          {
            foreignKeyName: "coach_profiles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollments: {
        Row: {
          client_id: string
          enrolled_at: string
          milestone_reviewed_at: string | null
          offering_id: string
          sessions_completed: number
        }
        Insert: {
          client_id: string
          enrolled_at?: string
          milestone_reviewed_at?: string | null
          offering_id: string
          sessions_completed?: number
        }
        Update: {
          client_id?: string
          enrolled_at?: string
          milestone_reviewed_at?: string | null
          offering_id?: string
          sessions_completed?: number
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      favourite_coaches: {
        Row: {
          coach_id: string
          created_at: string
          member_id: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          member_id: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favourite_coaches_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coach_directory"
            referencedColumns: ["coach_id"]
          },
          {
            foreignKeyName: "favourite_coaches_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "favourite_coaches_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reads: {
        Row: {
          client_id: string
          last_read_at: string
          reader_role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          client_id: string
          last_read_at?: string
          reader_role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          client_id?: string
          last_read_at?: string
          reader_role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: [
          {
            foreignKeyName: "message_reads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          client_id: string
          created_at: string
          id: string
          sender_id: string | null
          sender_role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          body: string
          client_id: string
          created_at?: string
          id?: string
          sender_id?: string | null
          sender_role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          body?: string
          client_id?: string
          created_at?: string
          id?: string
          sender_id?: string | null
          sender_role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: [
          {
            foreignKeyName: "messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mood_checkins: {
        Row: {
          client_id: string
          created_at: string
          id: string
          mood: Database["public"]["Enums"]["mood"]
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          mood: Database["public"]["Enums"]["mood"]
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          mood?: Database["public"]["Enums"]["mood"]
        }
        Relationships: [
          {
            foreignKeyName: "mood_checkins_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_prefs: {
        Row: {
          checkins: boolean
          enabled: boolean
          messages: boolean
          payments: boolean
          profile_id: string
          sessions: boolean
          tasks: boolean
          updated_at: string
        }
        Insert: {
          checkins?: boolean
          enabled?: boolean
          messages?: boolean
          payments?: boolean
          profile_id: string
          sessions?: boolean
          tasks?: boolean
          updated_at?: string
        }
        Update: {
          checkins?: boolean
          enabled?: boolean
          messages?: boolean
          payments?: boolean
          profile_id?: string
          sessions?: boolean
          tasks?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_prefs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          client_id: string | null
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["notification_kind"]
          payload: Json
          read_at: string | null
          recipient_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["notification_kind"]
          payload?: Json
          read_at?: string | null
          recipient_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["notification_kind"]
          payload?: Json
          read_at?: string | null
          recipient_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      offerings: {
        Row: {
          active: boolean
          coach_id: string
          created_at: string
          currency: string
          description: string
          duration: string
          format: Database["public"]["Enums"]["session_mode"]
          id: string
          name: string
          price: number
          session_count: number | null
          type: Database["public"]["Enums"]["offering_type"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          coach_id: string
          created_at?: string
          currency?: string
          description?: string
          duration?: string
          format?: Database["public"]["Enums"]["session_mode"]
          id?: string
          name: string
          price: number
          session_count?: number | null
          type?: Database["public"]["Enums"]["offering_type"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          coach_id?: string
          created_at?: string
          currency?: string
          description?: string
          duration?: string
          format?: Database["public"]["Enums"]["session_mode"]
          id?: string
          name?: string
          price?: number
          session_count?: number | null
          type?: Database["public"]["Enums"]["offering_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "offerings_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coach_directory"
            referencedColumns: ["coach_id"]
          },
          {
            foreignKeyName: "offerings_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      packages: {
        Row: {
          client_id: string
          created_at: string
          expires_at: string
          total: number
          updated_at: string
          used: number
        }
        Insert: {
          client_id: string
          created_at?: string
          expires_at: string
          total?: number
          updated_at?: string
          used?: number
        }
        Update: {
          client_id?: string
          created_at?: string
          expires_at?: string
          total?: number
          updated_at?: string
          used?: number
        }
        Relationships: [
          {
            foreignKeyName: "packages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          client_id: string
          created_at: string
          currency: string
          id: string
          kind: Database["public"]["Enums"]["payment_kind"]
          method: string | null
          note: string | null
          paid_at: string
          refund_of: string | null
          state: Database["public"]["Enums"]["payment_state"]
        }
        Insert: {
          amount: number
          client_id: string
          created_at?: string
          currency?: string
          id?: string
          kind?: Database["public"]["Enums"]["payment_kind"]
          method?: string | null
          note?: string | null
          paid_at?: string
          refund_of?: string | null
          state?: Database["public"]["Enums"]["payment_state"]
        }
        Update: {
          amount?: number
          client_id?: string
          created_at?: string
          currency?: string
          id?: string
          kind?: Database["public"]["Enums"]["payment_kind"]
          method?: string | null
          note?: string | null
          paid_at?: string
          refund_of?: string | null
          state?: Database["public"]["Enums"]["payment_state"]
        }
        Relationships: [
          {
            foreignKeyName: "payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_refund_of_fkey"
            columns: ["refund_of"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      pro_reports: {
        Row: {
          client_id: string | null
          coach_id: string | null
          created_at: string
          details: string
          id: string
          reason: Database["public"]["Enums"]["report_reason"]
          reporter_id: string | null
          resolution_note: string | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["report_status"]
        }
        Insert: {
          client_id?: string | null
          coach_id?: string | null
          created_at?: string
          details?: string
          id?: string
          reason: Database["public"]["Enums"]["report_reason"]
          reporter_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["report_status"]
        }
        Update: {
          client_id?: string | null
          coach_id?: string | null
          created_at?: string
          details?: string
          id?: string
          reason?: Database["public"]["Enums"]["report_reason"]
          reporter_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["report_status"]
        }
        Relationships: [
          {
            foreignKeyName: "pro_reports_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pro_reports_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pro_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_status: Database["public"]["Enums"]["account_status"]
          avatar_photo_url: string | null
          city: string | null
          country: string | null
          country_code: string | null
          country_flag: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          account_status?: Database["public"]["Enums"]["account_status"]
          avatar_photo_url?: string | null
          city?: string | null
          country?: string | null
          country_code?: string | null
          country_flag?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
          phone?: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          account_status?: Database["public"]["Enums"]["account_status"]
          avatar_photo_url?: string | null
          city?: string | null
          country?: string | null
          country_code?: string | null
          country_flag?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
      ratings: {
        Row: {
          client_id: string
          coach_id: string
          comment: string | null
          created_at: string
          id: string
          offering_id: string | null
          rating: number
          session_id: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          coach_id: string
          comment?: string | null
          created_at?: string
          id?: string
          offering_id?: string | null
          rating: number
          session_id?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          coach_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          offering_id?: string | null
          rating?: number
          session_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ratings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coach_directory"
            referencedColumns: ["coach_id"]
          },
          {
            foreignKeyName: "ratings_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "ratings_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      session_requests: {
        Row: {
          coach_id: string
          created_at: string
          currency: string
          id: string
          member_id: string
          offering_id: string | null
          price: number
          requested_start: string
          responded_at: string | null
          status: Database["public"]["Enums"]["request_status"]
        }
        Insert: {
          coach_id: string
          created_at?: string
          currency?: string
          id?: string
          member_id: string
          offering_id?: string | null
          price: number
          requested_start: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["request_status"]
        }
        Update: {
          coach_id?: string
          created_at?: string
          currency?: string
          id?: string
          member_id?: string
          offering_id?: string | null
          price?: number
          requested_start?: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["request_status"]
        }
        Relationships: [
          {
            foreignKeyName: "session_requests_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coach_directory"
            referencedColumns: ["coach_id"]
          },
          {
            foreignKeyName: "session_requests_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "session_requests_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_requests_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          attendance: Database["public"]["Enums"]["attendance"] | null
          attendance_set_at: string | null
          attendance_set_by: Database["public"]["Enums"]["app_role"] | null
          client_id: string
          created_at: string
          ended_at: string | null
          followed_up: boolean
          id: string
          recap: string | null
          scheduled_at: string
          updated_at: string
        }
        Insert: {
          attendance?: Database["public"]["Enums"]["attendance"] | null
          attendance_set_at?: string | null
          attendance_set_by?: Database["public"]["Enums"]["app_role"] | null
          client_id: string
          created_at?: string
          ended_at?: string | null
          followed_up?: boolean
          id?: string
          recap?: string | null
          scheduled_at: string
          updated_at?: string
        }
        Update: {
          attendance?: Database["public"]["Enums"]["attendance"] | null
          attendance_set_at?: string | null
          attendance_set_by?: Database["public"]["Enums"]["app_role"] | null
          client_id?: string
          created_at?: string
          ended_at?: string | null
          followed_up?: boolean
          id?: string
          recap?: string | null
          scheduled_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      standing_slots: {
        Row: {
          client_id: string
          day_of_week: number
          end_hour: number
          set_at: string
          start_hour: number
        }
        Insert: {
          client_id: string
          day_of_week: number
          end_hour: number
          set_at?: string
          start_hour: number
        }
        Update: {
          client_id?: string
          day_of_week?: number
          end_hour?: number
          set_at?: string
          start_hour?: number
        }
        Relationships: [
          {
            foreignKeyName: "standing_slots_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_cancel_feedback: {
        Row: {
          coach_id: string | null
          created_at: string
          id: string
          note: string
          reason: Database["public"]["Enums"]["cancel_reason"]
        }
        Insert: {
          coach_id?: string | null
          created_at?: string
          id?: string
          note?: string
          reason: Database["public"]["Enums"]["cancel_reason"]
        }
        Update: {
          coach_id?: string | null
          created_at?: string
          id?: string
          note?: string
          reason?: Database["public"]["Enums"]["cancel_reason"]
        }
        Relationships: [
          {
            foreignKeyName: "subscription_cancel_feedback_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coach_directory"
            referencedColumns: ["coach_id"]
          },
          {
            foreignKeyName: "subscription_cancel_feedback_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          coach_id: string
          created_at: string
          renews_at: string | null
          tier: Database["public"]["Enums"]["subscription_tier"]
          updated_at: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          renews_at?: string | null
          tier?: Database["public"]["Enums"]["subscription_tier"]
          updated_at?: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          renews_at?: string | null
          tier?: Database["public"]["Enums"]["subscription_tier"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: true
            referencedRelation: "coach_directory"
            referencedColumns: ["coach_id"]
          },
          {
            foreignKeyName: "subscriptions_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: true
            referencedRelation: "coach_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      tasks: {
        Row: {
          client_id: string
          created_at: string
          description: string
          done: boolean
          done_at: string | null
          due_at: string | null
          due_has_time: boolean
          id: string
          recurring: boolean
          title: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          description?: string
          done?: boolean
          done_at?: string | null
          due_at?: string | null
          due_has_time?: boolean
          id?: string
          recurring?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          description?: string
          done?: boolean
          done_at?: string | null
          due_at?: string | null
          due_has_time?: boolean
          id?: string
          recurring?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          bg: string
          cadence: Database["public"]["Enums"]["template_cadence"]
          coach_id: string
          created_at: string
          icon: string
          id: string
          name: string
          plan: string
          specialty: string
          tasks: string[]
          updated_at: string
        }
        Insert: {
          bg?: string
          cadence?: Database["public"]["Enums"]["template_cadence"]
          coach_id: string
          created_at?: string
          icon?: string
          id?: string
          name: string
          plan?: string
          specialty?: string
          tasks?: string[]
          updated_at?: string
        }
        Update: {
          bg?: string
          cadence?: Database["public"]["Enums"]["template_cadence"]
          coach_id?: string
          created_at?: string
          icon?: string
          id?: string
          name?: string
          plan?: string
          specialty?: string
          tasks?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "templates_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coach_directory"
            referencedColumns: ["coach_id"]
          },
          {
            foreignKeyName: "templates_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      time_blocks: {
        Row: {
          client_id: string | null
          coach_id: string
          created_at: string
          ends_at: string
          id: string
          kind: Database["public"]["Enums"]["time_block_kind"]
          label: string | null
          session_type: Database["public"]["Enums"]["session_type"] | null
          starts_at: string
        }
        Insert: {
          client_id?: string | null
          coach_id: string
          created_at?: string
          ends_at: string
          id?: string
          kind: Database["public"]["Enums"]["time_block_kind"]
          label?: string | null
          session_type?: Database["public"]["Enums"]["session_type"] | null
          starts_at: string
        }
        Update: {
          client_id?: string | null
          coach_id?: string
          created_at?: string
          ends_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["time_block_kind"]
          label?: string | null
          session_type?: Database["public"]["Enums"]["session_type"] | null
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_blocks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_blocks_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coach_directory"
            referencedColumns: ["coach_id"]
          },
          {
            foreignKeyName: "time_blocks_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      verification_requests: {
        Row: {
          coach_id: string
          id: string
          note: string
          reviewed_at: string | null
          reviewer_note: string | null
          status: Database["public"]["Enums"]["review_status"]
          submitted_at: string
        }
        Insert: {
          coach_id: string
          id?: string
          note?: string
          reviewed_at?: string | null
          reviewer_note?: string | null
          status?: Database["public"]["Enums"]["review_status"]
          submitted_at?: string
        }
        Update: {
          coach_id?: string
          id?: string
          note?: string
          reviewed_at?: string | null
          reviewer_note?: string | null
          status?: Database["public"]["Enums"]["review_status"]
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "verification_requests_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coach_directory"
            referencedColumns: ["coach_id"]
          },
          {
            foreignKeyName: "verification_requests_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      weekly_availability: {
        Row: {
          coach_id: string
          day_of_week: number
          enabled: boolean
          end_hour: number
          start_hour: number
        }
        Insert: {
          coach_id: string
          day_of_week: number
          enabled?: boolean
          end_hour: number
          start_hour: number
        }
        Update: {
          coach_id?: string
          day_of_week?: number
          enabled?: boolean
          end_hour?: number
          start_hour?: number
        }
        Relationships: [
          {
            foreignKeyName: "weekly_availability_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coach_directory"
            referencedColumns: ["coach_id"]
          },
          {
            foreignKeyName: "weekly_availability_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
    }
    Views: {
      coach_directory: {
        Row: {
          avatar_photo_url: string | null
          bio: string | null
          certifications: string[] | null
          coach_id: string | null
          country: string | null
          country_flag: string | null
          cover_photo_url: string | null
          experience_years: number | null
          featured: boolean | null
          from_price: number | null
          full_name: string | null
          languages: string[] | null
          rating_avg: number | null
          rating_count: number | null
          session_mode: Database["public"]["Enums"]["session_mode"] | null
          title: string | null
          verified: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "coach_profiles_profile_id_fkey"
            columns: ["coach_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_reviews: {
        Row: {
          avatar_bg: string | null
          coach_id: string | null
          comment: string | null
          created_at: string | null
          id: string | null
          rating: number | null
          reviewer_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ratings_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coach_directory"
            referencedColumns: ["coach_id"]
          },
          {
            foreignKeyName: "ratings_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
    }
    Functions: {
      can_see_client: { Args: { p_client: string }; Returns: boolean }
      client_counterparty: {
        Args: { p_actor: string; p_client: string }
        Returns: string
      }
      is_coach_of: { Args: { p_client: string }; Returns: boolean }
      is_member_of: { Args: { p_client: string }; Returns: boolean }
      push_notification: {
        Args: {
          p_client: string
          p_kind: Database["public"]["Enums"]["notification_kind"]
          p_payload: Json
          p_recipient: string
        }
        Returns: undefined
      }
    }
    Enums: {
      account_status: "active" | "suspended" | "deleted"
      agreement_status: "sent" | "signed"
      app_role: "coach" | "client"
      attendance: "attended" | "no_show" | "cancelled" | "disputed"
      cancel_reason:
        | "too_expensive"
        | "not_using"
        | "missing_features"
        | "switching"
        | "other"
      deletion_status: "pending" | "completed" | "cancelled"
      mood: "great" | "good" | "okay" | "low" | "hard"
      notification_kind:
        | "session-request"
        | "payment-received"
        | "task-completed"
        | "message"
        | "session-pending"
        | "session-confirmed"
        | "task-overdue"
        | "feedback"
        | "payment-overdue"
        | "payment-due"
        | "package-expired"
        | "package-out"
        | "package-soon"
      offering_type:
        | "session"
        | "consultation"
        | "group"
        | "workshop"
        | "program"
        | "event"
      payment_kind: "charge" | "refund"
      payment_state: "completed" | "pending" | "refunded"
      payment_status: "paid" | "due" | "overdue"
      report_reason: "no_show" | "inappropriate" | "payment" | "other"
      report_status: "open" | "actioned" | "dismissed"
      request_status: "pending" | "accepted" | "declined" | "withdrawn"
      review_status: "pending" | "approved" | "rejected"
      session_mode: "online" | "in_person" | "both"
      session_type: "intro" | "short" | "standard"
      subscription_tier: "free" | "pro"
      template_cadence: "Weekly" | "Bi-weekly" | "2x/week" | "3x/week"
      time_block_kind: "available" | "busy" | "pending" | "booked"
      verification_status: "unverified" | "pending" | "verified"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      account_status: ["active", "suspended", "deleted"],
      agreement_status: ["sent", "signed"],
      app_role: ["coach", "client"],
      attendance: ["attended", "no_show", "cancelled", "disputed"],
      cancel_reason: [
        "too_expensive",
        "not_using",
        "missing_features",
        "switching",
        "other",
      ],
      deletion_status: ["pending", "completed", "cancelled"],
      mood: ["great", "good", "okay", "low", "hard"],
      notification_kind: [
        "session-request",
        "payment-received",
        "task-completed",
        "message",
        "session-pending",
        "session-confirmed",
        "task-overdue",
        "feedback",
        "payment-overdue",
        "payment-due",
        "package-expired",
        "package-out",
        "package-soon",
      ],
      offering_type: [
        "session",
        "consultation",
        "group",
        "workshop",
        "program",
        "event",
      ],
      payment_kind: ["charge", "refund"],
      payment_state: ["completed", "pending", "refunded"],
      payment_status: ["paid", "due", "overdue"],
      report_reason: ["no_show", "inappropriate", "payment", "other"],
      report_status: ["open", "actioned", "dismissed"],
      request_status: ["pending", "accepted", "declined", "withdrawn"],
      review_status: ["pending", "approved", "rejected"],
      session_mode: ["online", "in_person", "both"],
      session_type: ["intro", "short", "standard"],
      subscription_tier: ["free", "pro"],
      template_cadence: ["Weekly", "Bi-weekly", "2x/week", "3x/week"],
      time_block_kind: ["available", "busy", "pending", "booked"],
      verification_status: ["unverified", "pending", "verified"],
    },
  },
} as const
