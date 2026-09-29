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
          leadership_section: 'rebentos' | 'ticoes' | 'exploradores' | 'companheiros' | 'embaixadores' | null
          helper_role: 'coordenador' | 'dirigente' | null
          helper_section: 'rebentos' | 'ticoes' | 'exploradores' | 'companheiros' | 'embaixadores' | null
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
          leadership_section?: 'rebentos' | 'ticoes' | 'exploradores' | 'companheiros' | 'embaixadores' | null
          helper_role?: 'coordenador' | 'dirigente' | null
          helper_section?: 'rebentos' | 'ticoes' | 'exploradores' | 'companheiros' | 'embaixadores' | null
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
          leadership_section?: 'rebentos' | 'ticoes' | 'exploradores' | 'companheiros' | 'embaixadores' | null
          helper_role?: 'coordenador' | 'dirigente' | null
          helper_section?: 'rebentos' | 'ticoes' | 'exploradores' | 'companheiros' | 'embaixadores' | null
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
          price_eur: number
          max_discount_percent: number
          type: 'physical' | 'digital'
          stock: number
          image_url: string | null
          restrictions: Json
          is_active: boolean
          min_level: number
          is_preorder: boolean
          preorder_deadline: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          price?: number
          price_eur?: number
          max_discount_percent?: number
          type: 'physical' | 'digital'
          stock?: number
          image_url?: string | null
          restrictions?: Json
          is_active?: boolean
          min_level?: number
          is_preorder?: boolean
          preorder_deadline?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          price?: number
          price_eur?: number
          max_discount_percent?: number
          type?: 'physical' | 'digital'
          stock?: number
          image_url?: string | null
          restrictions?: Json
          is_active?: boolean
          min_level?: number
          is_preorder?: boolean
          preorder_deadline?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      store_settings: {
        Row: {
          id: boolean
          base_gold_per_euro: number
          reference_total_gold: number
          min_rate_multiplier: number
          max_rate_multiplier: number
          updated_at: string
        }
        Insert: {
          id?: boolean
          base_gold_per_euro?: number
          reference_total_gold?: number
          min_rate_multiplier?: number
          max_rate_multiplier?: number
          updated_at?: string
        }
        Update: {
          id?: boolean
          base_gold_per_euro?: number
          reference_total_gold?: number
          min_rate_multiplier?: number
          max_rate_multiplier?: number
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
          user_id: string | null
          buyer_name: string | null
          product_id: string
          status: 'pending' | 'delivered' | 'refunded'
          digital_key_delivered: string | null
          price_eur: number
          discount_eur: number
          amount_due_eur: number
          quantity: number
          gold_spent: number
          gold_rate: number | null
          paid_at: string | null
          delivered_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          buyer_name?: string | null
          product_id: string
          status?: 'pending' | 'delivered' | 'refunded'
          digital_key_delivered?: string | null
          price_eur?: number
          discount_eur?: number
          amount_due_eur?: number
          quantity?: number
          gold_spent?: number
          gold_rate?: number | null
          paid_at?: string | null
          delivered_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          buyer_name?: string | null
          product_id?: string
          status?: 'pending' | 'delivered' | 'refunded'
          digital_key_delivered?: string | null
          price_eur?: number
          discount_eur?: number
          amount_due_eur?: number
          quantity?: number
          gold_spent?: number
          gold_rate?: number | null
          paid_at?: string | null
          delivered_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: {
      digital_key_stock: {
        Row: {
          product_id: string
          available: number
        }
      }
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
        Args: { p_product_id: string; p_discount_eur?: number; p_buyer_name?: string | null }
        Returns: Json
      }
      refund_purchase: {
        Args: { p_purchase_id: string }
        Returns: undefined
      }
      mark_purchase_paid: {
        Args: { p_purchase_id: string; p_deliver?: boolean }
        Returns: undefined
      }
      mark_purchase_delivered: {
        Args: { p_purchase_id: string }
        Returns: undefined
      }
      get_gold_rate_info: {
        Args: Record<string, never>
        Returns: Json
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
