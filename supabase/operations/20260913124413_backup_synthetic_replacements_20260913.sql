
create table maintenance.survey_synthetic_replacement_20260913_respondents_backup as
select now() as backed_up_at, p.survey_code, p.new_type, p.new_id, p.new_name, p.new_detail, sr.*
from maintenance.survey_synthetic_replacement_20260913_plan p
join public.survey_respondents sr on sr.id=p.old_assignment_id;

create table maintenance.survey_synthetic_replacement_20260913_responses_backup as
select now() as backed_up_at, p.survey_code, p.old_assignment_id, p.new_type, p.new_id, p.new_name, r.*
from maintenance.survey_synthetic_replacement_20260913_plan p
join public.survey_individual_responses r
  on r.survey_id=p.target_survey_id and r.branch_id=p.branch_id
 and r.respondent_type=p.old_type and r.respondent_id=p.old_id;

create table maintenance.survey_synthetic_replacement_20260913_t6_responses_backup as
select now() as backed_up_at, p.survey_code as target_survey_code, p.target_survey_id,
       p.new_type, p.new_id, p.new_name, r.*
from maintenance.survey_synthetic_replacement_20260913_plan p
join public.survey_individual_responses r
  on r.survey_id=p.t6_survey_id and r.branch_id=p.branch_id
 and r.respondent_type=p.new_type and r.respondent_id=p.new_id;

create table maintenance.survey_synthetic_replacement_20260913_submissions_backup as
select now() as backed_up_at, s.*
from public.survey_branch_submissions s
where s.branch_id='d7322d28-9d5d-4c2c-bc25-f919991e88c6'::uuid
and s.survey_id in (
 '2a246044-326b-41c7-9dc2-d1355f85b66c'::uuid,
 '736e4337-5d6a-4baf-85df-3dfa61b824fb'::uuid,
 '7b6ee5b2-ecd2-4b86-9804-1e4ac15addb4'::uuid
);

create table maintenance.survey_synthetic_replacement_20260913_answer_plan as
with old_rows as (
 select b.*, q.question_text,
        lower(regexp_replace(trim(q.question_text), '\s+', ' ', 'g')) as norm_text
 from maintenance.survey_synthetic_replacement_20260913_responses_backup b
 join public.survey_questions q on q.id=b.question_id
),
matched as (
 select o.*,
        m.t6_question_id, m.t6_option_id, m.t6_text_answer, m.target_mapped_option_id
 from old_rows o
 left join lateral (
   select q6.id as t6_question_id,
          r6.option_id as t6_option_id,
          r6.text_answer as t6_text_answer,
          ot.id as target_mapped_option_id
   from public.survey_questions q6
   join maintenance.survey_synthetic_replacement_20260913_t6_responses_backup r6
     on r6.question_id=q6.id
    and r6.target_survey_id=o.survey_id
    and r6.branch_id=o.branch_id
    and r6.respondent_type=o.new_type
    and r6.respondent_id=o.new_id
   left join public.survey_response_options os on os.id=r6.option_id
   left join public.survey_response_options ot
     on ot.question_id=o.question_id
    and lower(trim(ot.label))=lower(trim(os.label))
   where lower(regexp_replace(trim(q6.question_text), '\s+', ' ', 'g'))=o.norm_text
   order by q6.order_index, ot.order_index
   limit 1
 ) m on true
)
select
 now() as planned_at,
 survey_code, survey_id, branch_id,
 respondent_type as old_type, respondent_id as old_id, respondent_name as old_name,
 new_type, new_id, new_name,
 question_id,
 case
   when t6_option_id is not null and target_mapped_option_id is not null then target_mapped_option_id
   when t6_option_id is null and nullif(trim(t6_text_answer),'') is not null and option_id is null then null
   else option_id
 end as option_id,
 case
   when t6_option_id is not null and target_mapped_option_id is not null then null
   when t6_option_id is null and nullif(trim(t6_text_answer),'') is not null and option_id is null then t6_text_answer
   else text_answer
 end as text_answer,
 answered_by,
 case
   when t6_option_id is not null and target_mapped_option_id is not null then 't6_match'
   when t6_option_id is null and nullif(trim(t6_text_answer),'') is not null and option_id is null then 't6_match'
   else 'same_survey_template'
 end as answer_source,
 id as old_response_id
from matched;
