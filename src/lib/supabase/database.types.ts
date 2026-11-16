
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "app_settings": {
                  Row: {
                    "key": string,"updated_at": string,"updated_by": string | null,"value": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "key": string,"updated_at"?: string,"updated_by"?: string | null,"value": NonNullable<Json>
                  }
                  Update: {
                    "key"?: string,"updated_at"?: string,"updated_by"?: string | null,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "app_settings_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_log": {
                  Row: {
                    "action": string,"actor_id": string | null,"created_at": string,"detail": NonNullable<Json>,"entity_id": string | null,"entity_type": string,"id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"created_at"?: string,"detail"?: NonNullable<Json>,"entity_id"?: string | null,"entity_type": string,"id"?: never
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"created_at"?: string,"detail"?: NonNullable<Json>,"entity_id"?: string | null,"entity_type"?: string,"id"?: never
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_log_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"department_members": {
                  Row: {
                    "created_at": string,"department_id": string,"is_lead": boolean,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"department_id": string,"is_lead"?: boolean,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"department_id"?: string,"is_lead"?: boolean,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "department_members_department_id_fkey"
      columns: ["department_id"]
isOneToOne: false
      referencedRelation: "departments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "department_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"departments": {
                  Row: {
                    "created_at": string,"id": string,"is_active": boolean,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"name": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"freight_estimate_versions": {
                  Row: {
                    "created_at": string,"created_by": string | null,"engine_version": string,"estimate_id": string,"id": string,"inputs": NonNullable<Json>,"is_complete": boolean,"note": string,"results": NonNullable<Json>,"version_no": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"engine_version": string,"estimate_id": string,"id"?: string,"inputs": NonNullable<Json>,"is_complete": boolean,"note"?: string,"results": NonNullable<Json>,"version_no": number
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"engine_version"?: string,"estimate_id"?: string,"id"?: string,"inputs"?: NonNullable<Json>,"is_complete"?: boolean,"note"?: string,"results"?: NonNullable<Json>,"version_no"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "freight_estimate_versions_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "freight_estimate_versions_estimate_id_fkey"
      columns: ["estimate_id"]
isOneToOne: false
      referencedRelation: "freight_estimates"
      referencedColumns: ["id"]
    }
                  ]
                },"freight_estimates": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"created_by": string | null,"current_version_no": number,"grand_total": number | null,"id": string,"is_complete": boolean,"is_demo": boolean,"name": string,"reference": string,"reporting_currency": string | null,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"current_version_no"?: number,"grand_total"?: number | null,"id"?: string,"is_complete"?: boolean,"is_demo"?: boolean,"name": string,"reference"?: string,"reporting_currency"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"current_version_no"?: number,"grand_total"?: number | null,"id"?: string,"is_complete"?: boolean,"is_demo"?: boolean,"name"?: string,"reference"?: string,"reporting_currency"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "freight_estimates_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "freight_estimates_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"job_runs": {
                  Row: {
                    "created_count": number,"detail": NonNullable<Json>,"error": string | null,"finished_at": string | null,"id": number,"job_name": string,"run_date": string,"started_at": string,"status": string,"triggered_by": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_count"?: number,"detail"?: NonNullable<Json>,"error"?: string | null,"finished_at"?: string | null,"id"?: never,"job_name": string,"run_date": string,"started_at"?: string,"status"?: string,"triggered_by": string
                  }
                  Update: {
                    "created_count"?: number,"detail"?: NonNullable<Json>,"error"?: string | null,"finished_at"?: string | null,"id"?: never,"job_name"?: string,"run_date"?: string,"started_at"?: string,"status"?: string,"triggered_by"?: string
                  }
                  Relationships: [
                    
                  ]
                },"notifications": {
                  Row: {
                    "body": string,"created_at": string,"dedupe_key": string | null,"id": string,"kind": string,"link": string,"read_at": string | null,"sop_id": string | null,"task_id": string | null,"title": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string,"created_at"?: string,"dedupe_key"?: string | null,"id"?: string,"kind": string,"link"?: string,"read_at"?: string | null,"sop_id"?: string | null,"task_id"?: string | null,"title": string,"user_id": string
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"dedupe_key"?: string | null,"id"?: string,"kind"?: string,"link"?: string,"read_at"?: string | null,"sop_id"?: string | null,"task_id"?: string | null,"title"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_sop_id_fkey"
      columns: ["sop_id"]
isOneToOne: false
      referencedRelation: "sops"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_task_id_fkey"
      columns: ["task_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"email": string,"freight_access": Database["public"]['Enums']["freight_access"],"full_name": string,"id": string,"is_active": boolean,"is_demo": boolean,"role": Database["public"]['Enums']["user_role"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email": string,"freight_access"?: Database["public"]['Enums']["freight_access"],"full_name"?: string,"id": string,"is_active"?: boolean,"is_demo"?: boolean,"role"?: Database["public"]['Enums']["user_role"],"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"email"?: string,"freight_access"?: Database["public"]['Enums']["freight_access"],"full_name"?: string,"id"?: string,"is_active"?: boolean,"is_demo"?: boolean,"role"?: Database["public"]['Enums']["user_role"],"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"sop_acknowledgments": {
                  Row: {
                    "acknowledged_at": string,"sop_version_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "acknowledged_at"?: string,"sop_version_id": string,"user_id": string
                  }
                  Update: {
                    "acknowledged_at"?: string,"sop_version_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sop_acknowledgments_sop_version_id_fkey"
      columns: ["sop_version_id"]
isOneToOne: false
      referencedRelation: "sop_versions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sop_acknowledgments_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"sop_attachments": {
                  Row: {
                    "created_at": string,"file_name": string,"id": string,"mime_type": string | null,"size_bytes": number | null,"sop_id": string,"sop_version_id": string,"storage_path": string,"uploaded_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"file_name": string,"id"?: string,"mime_type"?: string | null,"size_bytes"?: number | null,"sop_id": string,"sop_version_id": string,"storage_path": string,"uploaded_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"file_name"?: string,"id"?: string,"mime_type"?: string | null,"size_bytes"?: number | null,"sop_id"?: string,"sop_version_id"?: string,"storage_path"?: string,"uploaded_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "sop_attachments_sop_id_fkey"
      columns: ["sop_id"]
isOneToOne: false
      referencedRelation: "sops"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sop_attachments_sop_version_id_fkey"
      columns: ["sop_version_id"]
isOneToOne: false
      referencedRelation: "sop_versions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sop_attachments_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"sop_categories": {
                  Row: {
                    "created_at": string,"id": string,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"sop_versions": {
                  Row: {
                    "change_summary": string,"created_at": string,"created_by": string | null,"id": string,"links": NonNullable<Json>,"published_at": string | null,"published_by": string | null,"purpose": string,"requires_ack": boolean,"sop_id": string,"status": Database["public"]['Enums']["sop_version_status"],"steps": NonNullable<Json>,"title": string,"updated_at": string,"version_no": number
                  }
                  ComputedFields: never
                  Insert: {
                    "change_summary"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"links"?: NonNullable<Json>,"published_at"?: string | null,"published_by"?: string | null,"purpose"?: string,"requires_ack"?: boolean,"sop_id": string,"status"?: Database["public"]['Enums']["sop_version_status"],"steps"?: NonNullable<Json>,"title": string,"updated_at"?: string,"version_no": number
                  }
                  Update: {
                    "change_summary"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"links"?: NonNullable<Json>,"published_at"?: string | null,"published_by"?: string | null,"purpose"?: string,"requires_ack"?: boolean,"sop_id"?: string,"status"?: Database["public"]['Enums']["sop_version_status"],"steps"?: NonNullable<Json>,"title"?: string,"updated_at"?: string,"version_no"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "sop_versions_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sop_versions_published_by_fkey"
      columns: ["published_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sop_versions_sop_id_fkey"
      columns: ["sop_id"]
isOneToOne: false
      referencedRelation: "sops"
      referencedColumns: ["id"]
    }
                  ]
                },"sops": {
                  Row: {
                    "archived_at": string | null,"category_id": string | null,"created_at": string,"created_by": string | null,"current_version_id": string | null,"department_id": string | null,"id": string,"is_sample": boolean,"next_review_date": string | null,"owner_id": string | null,"published_at": string | null,"search_text": string,"status": Database["public"]['Enums']["sop_status"],"tags": (string)[],"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"category_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"current_version_id"?: string | null,"department_id"?: string | null,"id"?: string,"is_sample"?: boolean,"next_review_date"?: string | null,"owner_id"?: string | null,"published_at"?: string | null,"search_text"?: string,"status"?: Database["public"]['Enums']["sop_status"],"tags"?: (string)[],"title": string,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"category_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"current_version_id"?: string | null,"department_id"?: string | null,"id"?: string,"is_sample"?: boolean,"next_review_date"?: string | null,"owner_id"?: string | null,"published_at"?: string | null,"search_text"?: string,"status"?: Database["public"]['Enums']["sop_status"],"tags"?: (string)[],"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sops_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "sop_categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sops_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sops_current_version_fk"
      columns: ["current_version_id"]
isOneToOne: false
      referencedRelation: "sop_versions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sops_department_id_fkey"
      columns: ["department_id"]
isOneToOne: false
      referencedRelation: "departments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sops_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"task_attachments": {
                  Row: {
                    "created_at": string,"file_name": string,"id": string,"mime_type": string | null,"size_bytes": number | null,"storage_path": string,"task_id": string,"uploaded_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"file_name": string,"id"?: string,"mime_type"?: string | null,"size_bytes"?: number | null,"storage_path": string,"task_id": string,"uploaded_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"file_name"?: string,"id"?: string,"mime_type"?: string | null,"size_bytes"?: number | null,"storage_path"?: string,"task_id"?: string,"uploaded_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "task_attachments_task_id_fkey"
      columns: ["task_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "task_attachments_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"task_checklist_items": {
                  Row: {
                    "created_at": string,"done_at": string | null,"done_by": string | null,"id": string,"is_done": boolean,"label": string,"position": number,"task_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"done_at"?: string | null,"done_by"?: string | null,"id"?: string,"is_done"?: boolean,"label": string,"position"?: number,"task_id": string
                  }
                  Update: {
                    "created_at"?: string,"done_at"?: string | null,"done_by"?: string | null,"id"?: string,"is_done"?: boolean,"label"?: string,"position"?: number,"task_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "task_checklist_items_done_by_fkey"
      columns: ["done_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "task_checklist_items_task_id_fkey"
      columns: ["task_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id"]
    }
                  ]
                },"task_comments": {
                  Row: {
                    "author_id": string | null,"body": string,"created_at": string,"id": string,"task_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id"?: string | null,"body": string,"created_at"?: string,"id"?: string,"task_id": string
                  }
                  Update: {
                    "author_id"?: string | null,"body"?: string,"created_at"?: string,"id"?: string,"task_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "task_comments_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "task_comments_task_id_fkey"
      columns: ["task_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id"]
    }
                  ]
                },"task_events": {
                  Row: {
                    "actor_id": string | null,"created_at": string,"detail": NonNullable<Json>,"event": string,"id": number,"task_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"created_at"?: string,"detail"?: NonNullable<Json>,"event": string,"id"?: never,"task_id": string
                  }
                  Update: {
                    "actor_id"?: string | null,"created_at"?: string,"detail"?: NonNullable<Json>,"event"?: string,"id"?: never,"task_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "task_events_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "task_events_task_id_fkey"
      columns: ["task_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id"]
    }
                  ]
                },"task_series": {
                  Row: {
                    "anchor_no": number,"checklist_template": NonNullable<Json>,"created_at": string,"created_by": string | null,"department_id": string | null,"description": string,"end_date": string | null,"escalate_overdue": boolean,"frequency": Database["public"]['Enums']["recurrence_frequency"],"id": string,"interval_count": number,"is_active": boolean,"is_demo": boolean,"kind": Database["public"]['Enums']["task_kind"],"last_occurrence_no": number,"owner_id": string,"priority": Database["public"]['Enums']["task_priority"],"remind_days_before": number | null,"schedule_mode": Database["public"]['Enums']["recurrence_mode"],"sop_id": string | null,"start_date": string,"title": string,"updated_at": string,"weekdays": (number)[] | null
                  }
                  ComputedFields: never
                  Insert: {
                    "anchor_no"?: number,"checklist_template"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"department_id"?: string | null,"description"?: string,"end_date"?: string | null,"escalate_overdue"?: boolean,"frequency": Database["public"]['Enums']["recurrence_frequency"],"id"?: string,"interval_count"?: number,"is_active"?: boolean,"is_demo"?: boolean,"kind": Database["public"]['Enums']["task_kind"],"last_occurrence_no"?: number,"owner_id": string,"priority"?: Database["public"]['Enums']["task_priority"],"remind_days_before"?: number | null,"schedule_mode": Database["public"]['Enums']["recurrence_mode"],"sop_id"?: string | null,"start_date": string,"title": string,"updated_at"?: string,"weekdays"?: (number)[] | null
                  }
                  Update: {
                    "anchor_no"?: number,"checklist_template"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"department_id"?: string | null,"description"?: string,"end_date"?: string | null,"escalate_overdue"?: boolean,"frequency"?: Database["public"]['Enums']["recurrence_frequency"],"id"?: string,"interval_count"?: number,"is_active"?: boolean,"is_demo"?: boolean,"kind"?: Database["public"]['Enums']["task_kind"],"last_occurrence_no"?: number,"owner_id"?: string,"priority"?: Database["public"]['Enums']["task_priority"],"remind_days_before"?: number | null,"schedule_mode"?: Database["public"]['Enums']["recurrence_mode"],"sop_id"?: string | null,"start_date"?: string,"title"?: string,"updated_at"?: string,"weekdays"?: (number)[] | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "task_series_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "task_series_department_id_fkey"
      columns: ["department_id"]
isOneToOne: false
      referencedRelation: "departments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "task_series_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "task_series_sop_id_fkey"
      columns: ["sop_id"]
isOneToOne: false
      referencedRelation: "sops"
      referencedColumns: ["id"]
    }
                  ]
                },"tasks": {
                  Row: {
                    "completed_at": string | null,"completed_by": string | null,"created_at": string,"created_by": string | null,"department_id": string | null,"description": string,"due_date": string | null,"escalate_overdue": boolean,"external_link_label": string,"external_link_url": string,"freight_estimate_id": string | null,"id": string,"is_demo": boolean,"kind": Database["public"]['Enums']["task_kind"],"occurrence_no": number | null,"owner_id": string,"priority": Database["public"]['Enums']["task_priority"],"remind_days_before": number | null,"scheduled_for": string | null,"series_id": string | null,"sop_id": string | null,"status": Database["public"]['Enums']["task_status"],"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "completed_at"?: string | null,"completed_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"department_id"?: string | null,"description"?: string,"due_date"?: string | null,"escalate_overdue"?: boolean,"external_link_label"?: string,"external_link_url"?: string,"freight_estimate_id"?: string | null,"id"?: string,"is_demo"?: boolean,"kind": Database["public"]['Enums']["task_kind"],"occurrence_no"?: number | null,"owner_id": string,"priority"?: Database["public"]['Enums']["task_priority"],"remind_days_before"?: number | null,"scheduled_for"?: string | null,"series_id"?: string | null,"sop_id"?: string | null,"status"?: Database["public"]['Enums']["task_status"],"title": string,"updated_at"?: string
                  }
                  Update: {
                    "completed_at"?: string | null,"completed_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"department_id"?: string | null,"description"?: string,"due_date"?: string | null,"escalate_overdue"?: boolean,"external_link_label"?: string,"external_link_url"?: string,"freight_estimate_id"?: string | null,"id"?: string,"is_demo"?: boolean,"kind"?: Database["public"]['Enums']["task_kind"],"occurrence_no"?: number | null,"owner_id"?: string,"priority"?: Database["public"]['Enums']["task_priority"],"remind_days_before"?: number | null,"scheduled_for"?: string | null,"series_id"?: string | null,"sop_id"?: string | null,"status"?: Database["public"]['Enums']["task_status"],"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tasks_completed_by_fkey"
      columns: ["completed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_department_id_fkey"
      columns: ["department_id"]
isOneToOne: false
      referencedRelation: "departments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_freight_estimate_id_fkey"
      columns: ["freight_estimate_id"]
isOneToOne: false
      referencedRelation: "freight_estimates"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_series_id_fkey"
      columns: ["series_id"]
isOneToOne: false
      referencedRelation: "task_series"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_sop_id_fkey"
      columns: ["sop_id"]
isOneToOne: false
      referencedRelation: "sops"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "admin_run_jobs":
{ Args: Record<PropertyKey, never>; Returns: {
              "created_count": number,
"detail": NonNullable<Json>,
"error": string | null,
"finished_at": string | null,
"id": number,
"job_name": string,
"run_date": string,
"started_at": string,
"status": string,
"triggered_by": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "job_runs"
        isOneToOne: false
        isSetofReturn: true
      } },
"freight_save_version":
{ Args: { "p_duplicated_from"?: string,"p_engine_version": string,"p_estimate_id": string,"p_grand_total": number,"p_inputs": Json,"p_is_complete": boolean,"p_name": string,"p_note": string,"p_reference": string,"p_reporting_currency": string,"p_results": Json }; Returns: {
              "estimate_id": string,"version_no": number
            }[]
                           },
"mark_notifications_read":
{ Args: { "p_ids"?: (string)[] }; Returns: number
                           },
"run_scheduled_jobs":
{ Args: { "p_today"?: string,"p_triggered_by"?: string }; Returns: {
              "created_count": number,
"detail": NonNullable<Json>,
"error": string | null,
"finished_at": string | null,
"id": number,
"job_name": string,
"run_date": string,
"started_at": string,
"status": string,
"triggered_by": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "job_runs"
        isOneToOne: false
        isSetofReturn: true
      } },
"sop_create":
{ Args: { "p_category_id": string,"p_department_id": string,"p_owner_id": string,"p_title": string }; Returns: string
                           },
"sop_publish":
{ Args: { "p_change_summary": string,"p_requires_ack": boolean,"p_version_id": string }; Returns: undefined
                           },
"sop_set_archived":
{ Args: { "p_archived": boolean,"p_sop_id": string }; Returns: undefined
                           },
"sop_start_revision":
{ Args: { "p_sop_id": string }; Returns: string
                           }
          }
          Enums: {
            "freight_access": "none"|"view"|"edit","recurrence_frequency": "daily"|"weekly"|"monthly","recurrence_mode": "fixed_schedule"|"after_completion","sop_status": "draft"|"published"|"archived","sop_version_status": "draft"|"published"|"superseded","task_kind": "personal"|"shared","task_priority": "low"|"normal"|"high"|"urgent","task_status": "open"|"in_progress"|"blocked"|"done"|"cancelled","user_role": "admin"|"department_lead"|"employee"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "freight_access": ["none", "view", "edit"],"recurrence_frequency": ["daily", "weekly", "monthly"],"recurrence_mode": ["fixed_schedule", "after_completion"],"sop_status": ["draft", "published", "archived"],"sop_version_status": ["draft", "published", "superseded"],"task_kind": ["personal", "shared"],"task_priority": ["low", "normal", "high", "urgent"],"task_status": ["open", "in_progress", "blocked", "done", "cancelled"],"user_role": ["admin", "department_lead", "employee"]
          }
        }
} as const
