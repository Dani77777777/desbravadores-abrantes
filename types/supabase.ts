export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      announcements: {
        Row: {
          id: string
          title: string
          message: string
          created_at: string
          author_id: string | null
          target_user_id: string | null
          target_section: 'ticoes' | 'exploradores' | 'companheiros' | 'embaixadores' | null
          target_role: 'coordenador' | 'dirigente' | 'desbravador' | null
        }
        Insert: {
          id?: string
          title: string
          message: string
          created_at?: string
          author_id?: string | null
          target_user_id?: string | null
          target_section?: 'ticoes' | 'exploradores' | 'companheiros' | 'embaixadores' | null
          target_role?: 'coordenador' | 'dirigente' | 'desbravador' | null
        }
        Update: {
          id?: string
          title?: string
          message?: string
          created_at?: string
          author_id?: string | null
          target_user_id?: string | null
          target_section?: 'ticoes' | 'exploradores' | 'companheiros' | 'embaixadores' | null
          target_role?: 'coordenador' | 'dirigente' | 'desbravador' | null
        }
      }
      points_log: {
        Row: {
          id: string
          target_user_id: string
          awarded_by_user_id: string | null
          amount_xp: number
          amount_gold: number
          description: string
          created_at: string
        }
        Insert: {
          id?: string
          target_user_id: string
          awarded_by_user_id?: string | null
          amount_xp?: number
          amount_gold?: number
          description: string
          created_at?: string
        }
        Update: {
          id?: string
          target_user_id?: string
          awarded_by_user_id?: string | null
          amount_xp?: number
          amount_gold?: number
          description?: string
          created_at?: string
        }
      }
      profiles: {
        Row: {
          id: string
          full_name: string
          avatar_url: string | null
          section: 'rebentos' | 'ticoes' | 'exploradores' | 'companheiros' | 'embaixadores'
          role: 'coordenador' | 'dirigente' | 'desbravador'
          total_xp: number
          current_gold: number
          created_at: string
          birth_date: string | null
          is_invested: boolean
        }
        Insert: {
          id: string
          full_name: string
          avatar_url?: string | null
          section?: 'rebentos' | 'ticoes' | 'exploradores' | 'companheiros' | 'embaixadores'
          role?: 'coordenador' | 'dirigente' | 'desbravador'
          total_xp?: number
          current_gold?: number
          created_at?: string
          birth_date?: string | null
          is_invested?: boolean
        }
        Update: {
          id?: string
          full_name?: string
          avatar_url?: string | null
          section?: 'rebentos' | 'ticoes' | 'exploradores' | 'companheiros' | 'embaixadores'
          role?: 'coordenador' | 'dirigente' | 'desbravador'
          total_xp?: number
          current_gold?: number
          created_at?: string
          birth_date?: string | null
          is_invested?: boolean
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      app_section: 'rebentos' | 'ticoes' | 'exploradores' | 'companheiros' | 'embaixadores'
      app_role: 'coordenador' | 'dirigente' | 'desbravador'
    }
  }
}
