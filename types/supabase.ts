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
      store_products: {
        Row: {
          id: string
          name: string
          description: string | null
          price: number
          type: 'physical' | 'digital'
          stock: number
          image_url: string | null
          restrictions: Json
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          price: number
          type: 'physical' | 'digital'
          stock?: number
          image_url?: string | null
          restrictions?: Json
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          price?: number
          type?: 'physical' | 'digital'
          stock?: number
          image_url?: string | null
          restrictions?: Json
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      digital_keys: {
        Row: {
          id: string
          product_id: string
          key_value: string
          is_used: boolean
          created_at: string
        }
        Insert: {
          id?: string
          product_id: string
          key_value: string
          is_used?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          product_id?: string
          key_value?: string
          is_used?: boolean
          created_at?: string
        }
      }
      store_purchases: {
        Row: {
          id: string
          user_id: string
          product_id: string
          status: 'pending' | 'delivered' | 'refunded'
          digital_key_delivered: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          product_id: string
          status?: 'pending' | 'delivered' | 'refunded'
          digital_key_delivered?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          product_id?: string
          status?: 'pending' | 'delivered' | 'refunded'
          digital_key_delivered?: string | null
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: {
      leaderboard: {
        Row: {
          id: string
          full_name: string
          avatar_url: string | null
          section: 'rebentos' | 'ticoes' | 'exploradores' | 'companheiros' | 'embaixadores'
          role: 'coordenador' | 'dirigente' | 'desbravador'
          total_xp: number
          current_gold: number
          combined_score: number
          is_invested: boolean
        }
      }
    }
    Functions: {
      process_purchase: {
        Args: { p_product_id: string }
        Returns: Json
      }
      refund_purchase: {
        Args: { p_purchase_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_section: 'rebentos' | 'ticoes' | 'exploradores' | 'companheiros' | 'embaixadores'
      app_role: 'coordenador' | 'dirigente' | 'desbravador'
      product_type: 'physical' | 'digital'
      purchase_status: 'pending' | 'delivered' | 'refunded'
    }
  }
}
