alter table job_interview_feedback
  drop constraint if exists job_interview_feedback_recommendation_check;

alter table job_interview_feedback
  add constraint job_interview_feedback_recommendation_check
  check (recommendation in ('strong_yes','yes','mixed','no','strong_no','no_decision','advance'));
