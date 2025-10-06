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
      roles: {
        Row: {
          id: string
          description: string | null
        }
        Insert: {
          id: string
          description?: string | null
        }
        Update: {
          id?: string
          description?: string | null
        }
      }
      profiles: {
        Row: {
          id: string
          auth_user_id: string | null
          email: string
          full_name: string | null
          role_id: string | null
          status: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          auth_user_id?: string | null
          email: string
          full_name?: string | null
          role_id?: string | null
          status?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          auth_user_id?: string | null
          email?: string
          full_name?: string | null
          role_id?: string | null
          status?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
      }
      approvals: {
        Row: {
          id: string
          requester_profile_id: string | null
          target_role: string
          approved_by: string | null
          approved_at: string | null
          status: string | null
          submitted_payload: Json | null
          created_at: string | null
        }
        Insert: {
          id?: string
          requester_profile_id?: string | null
          target_role: string
          approved_by?: string | null
          approved_at?: string | null
          status?: string | null
          submitted_payload?: Json | null
          created_at?: string | null
        }
        Update: {
          id?: string
          requester_profile_id?: string | null
          target_role?: string
          approved_by?: string | null
          approved_at?: string | null
          status?: string | null
          submitted_payload?: Json | null
          created_at?: string | null
        }
      }
      branches: {
        Row: {
          id: string
          name: string
          province: string | null
          address: string | null
          phone: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          name: string
          province?: string | null
          address?: string | null
          phone?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          province?: string | null
          address?: string | null
          phone?: string | null
          created_at?: string | null
        }
      }
      classrooms: {
        Row: {
          id: string
          branch_id: string | null
          name: string
          description: string | null
          teacher_staff_id: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          branch_id?: string | null
          name: string
          description?: string | null
          teacher_staff_id?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          branch_id?: string | null
          name?: string
          description?: string | null
          teacher_staff_id?: string | null
          created_at?: string | null
        }
      }
      staff: {
        Row: {
          id: string
          profile_id: string | null
          first_name: string | null
          last_name: string | null
          father_name: string | null
          dob: string | null
          gender: string | null
          national_id: string | null
          passport_number: string | null
          home_address: string | null
          phone: string | null
          email: string | null
          emergency_contact: string | null
          position: string | null
          job_description: string | null
          date_joined: string | null
          date_left: string | null
          history_activities: string | null
          short_bio: string | null
          family_parents_tazkira_url: string | null
          nid_photo_url: string | null
          passport_photo_url: string | null
          profile_photo_url: string | null
          cv_url: string | null
          education_docs_url: string | null
          status: string | null
          notes: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          profile_id?: string | null
          first_name?: string | null
          last_name?: string | null
          father_name?: string | null
          dob?: string | null
          gender?: string | null
          national_id?: string | null
          passport_number?: string | null
          home_address?: string | null
          phone?: string | null
          email?: string | null
          emergency_contact?: string | null
          position?: string | null
          job_description?: string | null
          date_joined?: string | null
          date_left?: string | null
          history_activities?: string | null
          short_bio?: string | null
          family_parents_tazkira_url?: string | null
          nid_photo_url?: string | null
          passport_photo_url?: string | null
          profile_photo_url?: string | null
          cv_url?: string | null
          education_docs_url?: string | null
          status?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          profile_id?: string | null
          first_name?: string | null
          last_name?: string | null
          father_name?: string | null
          dob?: string | null
          gender?: string | null
          national_id?: string | null
          passport_number?: string | null
          home_address?: string | null
          phone?: string | null
          email?: string | null
          emergency_contact?: string | null
          position?: string | null
          job_description?: string | null
          date_joined?: string | null
          date_left?: string | null
          history_activities?: string | null
          short_bio?: string | null
          family_parents_tazkira_url?: string | null
          nid_photo_url?: string | null
          passport_photo_url?: string | null
          profile_photo_url?: string | null
          cv_url?: string | null
          education_docs_url?: string | null
          status?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
      }
      students: {
        Row: {
          id: string
          profile_id: string | null
          first_name: string | null
          last_name: string | null
          father_name: string | null
          age: number | null
          gender: string | null
          national_id: string | null
          profile_photo_url: string | null
          address: string | null
          phone: string | null
          parent_phone: string | null
          education_level: string | null
          date_joined: string | null
          date_left: string | null
          status: string | null
          notes: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          profile_id?: string | null
          first_name?: string | null
          last_name?: string | null
          father_name?: string | null
          age?: number | null
          gender?: string | null
          national_id?: string | null
          profile_photo_url?: string | null
          address?: string | null
          phone?: string | null
          parent_phone?: string | null
          education_level?: string | null
          date_joined?: string | null
          date_left?: string | null
          status?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          profile_id?: string | null
          first_name?: string | null
          last_name?: string | null
          father_name?: string | null
          age?: number | null
          gender?: string | null
          national_id?: string | null
          profile_photo_url?: string | null
          address?: string | null
          phone?: string | null
          parent_phone?: string | null
          education_level?: string | null
          date_joined?: string | null
          date_left?: string | null
          status?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
      }
      class_teachers: {
        Row: {
          id: string
          classroom_id: string | null
          staff_id: string | null
          assigned_at: string | null
        }
        Insert: {
          id?: string
          classroom_id?: string | null
          staff_id?: string | null
          assigned_at?: string | null
        }
        Update: {
          id?: string
          classroom_id?: string | null
          staff_id?: string | null
          assigned_at?: string | null
        }
      }
      enrollments: {
        Row: {
          id: string
          student_id: string | null
          classroom_id: string | null
          start_date: string | null
          end_date: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          student_id?: string | null
          classroom_id?: string | null
          start_date?: string | null
          end_date?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          student_id?: string | null
          classroom_id?: string | null
          start_date?: string | null
          end_date?: string | null
          created_at?: string | null
        }
      }
      books: {
        Row: {
          id: string
          branch_id: string | null
          title: string
          author: string | null
          genre: string | null
          subject: string | null
          quantity: number | null
          code_number: string | null
          status: string | null
          times_borrowed: number | null
          times_returned: number | null
          available_copies: number | null
          date_of_entry: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          branch_id?: string | null
          title: string
          author?: string | null
          genre?: string | null
          subject?: string | null
          quantity?: number | null
          code_number?: string | null
          status?: string | null
          times_borrowed?: number | null
          times_returned?: number | null
          date_of_entry?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          branch_id?: string | null
          title?: string
          author?: string | null
          genre?: string | null
          subject?: string | null
          quantity?: number | null
          code_number?: string | null
          status?: string | null
          times_borrowed?: number | null
          times_returned?: number | null
          date_of_entry?: string | null
          created_at?: string | null
        }
      }
      library_visits: {
        Row: {
          id: string
          branch_id: string | null
          full_name: string | null
          father_name: string | null
          gender: string | null
          age: number | null
          phone: string | null
          email: string | null
          address: string | null
          date_of_visit: string | null
          purpose: string | null
          borrowed_book_id: string | null
          return_due: string | null
          membership_status: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          branch_id?: string | null
          full_name?: string | null
          father_name?: string | null
          gender?: string | null
          age?: number | null
          phone?: string | null
          email?: string | null
          address?: string | null
          date_of_visit?: string | null
          purpose?: string | null
          borrowed_book_id?: string | null
          return_due?: string | null
          membership_status?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          branch_id?: string | null
          full_name?: string | null
          father_name?: string | null
          gender?: string | null
          age?: number | null
          phone?: string | null
          email?: string | null
          address?: string | null
          date_of_visit?: string | null
          purpose?: string | null
          borrowed_book_id?: string | null
          return_due?: string | null
          membership_status?: string | null
          created_at?: string | null
        }
      }
      book_loans: {
        Row: {
          id: string
          book_id: string | null
          borrower_student_id: string | null
          borrower_staff_id: string | null
          checked_out_at: string | null
          due_at: string | null
          returned_at: string | null
        }
        Insert: {
          id?: string
          book_id?: string | null
          borrower_student_id?: string | null
          borrower_staff_id?: string | null
          checked_out_at?: string | null
          due_at?: string | null
          returned_at?: string | null
        }
        Update: {
          id?: string
          book_id?: string | null
          borrower_student_id?: string | null
          borrower_staff_id?: string | null
          checked_out_at?: string | null
          due_at?: string | null
          returned_at?: string | null
        }
      }
      documents: {
        Row: {
          id: string
          owner_profile_id: string | null
          category: string | null
          file_url: string
          meta: Json | null
          created_at: string | null
        }
        Insert: {
          id?: string
          owner_profile_id?: string | null
          category?: string | null
          file_url: string
          meta?: Json | null
          created_at?: string | null
        }
        Update: {
          id?: string
          owner_profile_id?: string | null
          category?: string | null
          file_url?: string
          meta?: Json | null
          created_at?: string | null
        }
      }
      notifications: {
        Row: {
          id: string
          profile_id: string | null
          message: string | null
          read_at: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          profile_id?: string | null
          message?: string | null
          read_at?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          profile_id?: string | null
          message?: string | null
          read_at?: string | null
          created_at?: string | null
        }
      }
      audit_log: {
        Row: {
          id: string
          actor_profile_id: string | null
          action: string | null
          entity: string | null
          entity_id: string | null
          diff: Json | null
          created_at: string | null
        }
        Insert: {
          id?: string
          actor_profile_id?: string | null
          action?: string | null
          entity?: string | null
          entity_id?: string | null
          diff?: Json | null
          created_at?: string | null
        }
        Update: {
          id?: string
          actor_profile_id?: string | null
          action?: string | null
          entity?: string | null
          entity_id?: string | null
          diff?: Json | null
          created_at?: string | null
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
      [_ in never]: never
    }
  }
}
