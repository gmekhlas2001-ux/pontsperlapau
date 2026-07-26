-- Correct Dari sentiment metadata for template surveys that already have
-- individual responses. Surveys with zero individual responses are snapshotted
-- and asserted unchanged before the transaction can commit.

SET LOCAL lock_timeout = '10s';

LOCK TABLE public.surveys, public.survey_individual_responses IN SHARE MODE;
LOCK TABLE public.survey_questions, public.survey_response_options
  IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE started_survey_sentiment_scope (
  survey_id uuid PRIMARY KEY,
  template text
) ON COMMIT DROP;

INSERT INTO pg_temp.started_survey_sentiment_scope (survey_id, template)
SELECT
  survey.id,
  CASE
    WHEN survey.title LIKE 'ارزیابی نهایی%' THEN 'T1'
    WHEN survey.title LIKE 'T2 - %' THEN 'T2'
    WHEN survey.title LIKE 'T3 - %' THEN 'T3'
    WHEN survey.title LIKE 'T4 - %' THEN 'T4'
    WHEN survey.title LIKE 'T5 - %' THEN 'T5'
    WHEN survey.title LIKE 'T6 - %' THEN 'T6'
  END
FROM public.surveys AS survey
WHERE EXISTS (
  SELECT 1
  FROM public.survey_individual_responses AS response
  WHERE response.survey_id = survey.id
);

DO $$
DECLARE
  unknown_started_surveys integer;
BEGIN
  SELECT count(*)
  INTO unknown_started_surveys
  FROM pg_temp.started_survey_sentiment_scope
  WHERE template IS NULL;

  IF unknown_started_surveys <> 0 THEN
    RAISE EXCEPTION
      'Started survey template verification failed: % unknown surveys',
      unknown_started_surveys;
  END IF;
END;
$$;

CREATE TEMP TABLE zero_survey_sentiment_snapshot
ON COMMIT DROP AS
SELECT
  'question'::text AS record_type,
  question.id,
  question.sentiment_enabled::text AS sentiment_value
FROM public.survey_questions AS question
WHERE NOT EXISTS (
  SELECT 1
  FROM pg_temp.started_survey_sentiment_scope AS scope
  WHERE scope.survey_id = question.survey_id
)
UNION ALL
SELECT
  'option'::text AS record_type,
  option.id,
  option.sentiment AS sentiment_value
FROM public.survey_response_options AS option
WHERE NOT EXISTS (
  SELECT 1
  FROM pg_temp.started_survey_sentiment_scope AS scope
  WHERE scope.survey_id = option.survey_id
);

CREATE TEMP TABLE expected_started_question_sentiments (
  survey_id uuid NOT NULL,
  question_id uuid PRIMARY KEY,
  template text NOT NULL,
  question_index integer NOT NULL,
  expected_sentiments text[]
) ON COMMIT DROP;

INSERT INTO pg_temp.expected_started_question_sentiments (
  survey_id,
  question_id,
  template,
  question_index,
  expected_sentiments
)
SELECT
  scope.survey_id,
  question.id,
  scope.template,
  question.order_index,
  CASE
    -- The first three questions are common neutral demographic fields.
    WHEN question.order_index = 0 THEN ARRAY['neutral', 'neutral', 'neutral']
    WHEN question.order_index = 1 THEN ARRAY['neutral', 'neutral', 'neutral', 'neutral']
    WHEN question.order_index = 2 THEN ARRAY['neutral', 'neutral', 'neutral']

    WHEN scope.template = 'T1' AND question.order_index BETWEEN 3 AND 5
      THEN ARRAY['negative', 'neutral', 'positive']
    WHEN scope.template = 'T1' AND question.order_index IN (
      6, 7, 15, 22, 23, 26, 27, 30, 34, 35, 37
    ) THEN ARRAY['positive', 'negative']
    WHEN scope.template = 'T1' AND question.order_index IN (
      8, 9, 10, 11, 12, 13, 14, 18, 19, 20, 21, 24, 29
    ) THEN ARRAY['negative', 'negative', 'neutral', 'positive', 'positive']
    WHEN scope.template = 'T1' AND question.order_index IN (16, 32)
      THEN ARRAY['negative', 'negative', 'neutral', 'positive']
    WHEN scope.template = 'T1' AND question.order_index IN (17, 25)
      THEN ARRAY['positive', 'neutral', 'negative']
    WHEN scope.template = 'T1' AND question.order_index = 28
      THEN ARRAY['negative', 'negative', 'negative', 'negative', 'neutral']
    WHEN scope.template = 'T1' AND question.order_index = 31
      THEN ARRAY['neutral', 'neutral']
    WHEN scope.template = 'T1' AND question.order_index = 33
      THEN ARRAY['neutral', 'positive']
    WHEN scope.template = 'T1' AND question.order_index = 36
      THEN ARRAY['negative', 'neutral', 'positive']

    WHEN scope.template = 'T2' AND question.order_index BETWEEN 3 AND 13
      THEN ARRAY['negative', 'neutral', 'positive']

    WHEN scope.template = 'T3' AND question.order_index BETWEEN 3 AND 7
      THEN ARRAY['negative', 'neutral', 'positive', 'positive']

    WHEN scope.template = 'T4' AND question.order_index BETWEEN 3 AND 16
      THEN ARRAY['negative', 'negative', 'neutral', 'positive', 'positive']
    WHEN scope.template = 'T4' AND question.order_index BETWEEN 17 AND 18
      THEN ARRAY[]::text[]

    WHEN scope.template = 'T5' AND question.order_index IN (3, 19)
      THEN ARRAY['positive', 'neutral', 'negative', 'negative', 'neutral']
    WHEN scope.template = 'T5' AND question.order_index IN (17, 33)
      THEN ARRAY['positive', 'neutral', 'negative', 'neutral']
    WHEN scope.template = 'T5' AND question.order_index BETWEEN 4 AND 34
      THEN ARRAY['positive', 'positive', 'neutral', 'negative', 'negative', 'neutral']

    WHEN scope.template = 'T6' AND question.order_index BETWEEN 3 AND 22
      THEN ARRAY['positive', 'positive', 'neutral', 'negative', 'negative', 'neutral']
    WHEN scope.template = 'T6' AND question.order_index = 23
      THEN ARRAY['positive', 'negative', 'neutral']
    WHEN scope.template = 'T6' AND question.order_index = 24
      THEN ARRAY['positive', 'positive', 'negative', 'negative', 'neutral']
    WHEN scope.template = 'T6' AND question.order_index = 25
      THEN ARRAY['neutral', 'neutral', 'neutral', 'neutral', 'neutral', 'neutral']
  END
FROM pg_temp.started_survey_sentiment_scope AS scope
JOIN public.survey_questions AS question
  ON question.survey_id = scope.survey_id;

DO $$
DECLARE
  question_index_mismatches integer;
  option_shape_mismatches integer;
BEGIN
  WITH per_survey AS (
    SELECT
      scope.survey_id,
      scope.template,
      array_agg(question.order_index ORDER BY question.order_index) AS actual_indexes
    FROM pg_temp.started_survey_sentiment_scope AS scope
    JOIN public.survey_questions AS question
      ON question.survey_id = scope.survey_id
    GROUP BY scope.survey_id, scope.template
  )
  SELECT count(*)
  INTO question_index_mismatches
  FROM per_survey
  WHERE actual_indexes IS DISTINCT FROM CASE template
    WHEN 'T1' THEN ARRAY(SELECT generate_series(0, 37))
    WHEN 'T2' THEN ARRAY(SELECT generate_series(0, 13))
    WHEN 'T3' THEN ARRAY(SELECT generate_series(0, 7))
    WHEN 'T4' THEN ARRAY(SELECT generate_series(0, 18))
    WHEN 'T5' THEN ARRAY(SELECT generate_series(0, 34))
    WHEN 'T6' THEN ARRAY(SELECT generate_series(0, 25))
  END;

  WITH per_question AS (
    SELECT
      expected.question_id,
      expected.expected_sentiments,
      coalesce(
        array_agg(option.order_index ORDER BY option.order_index)
          FILTER (WHERE option.id IS NOT NULL),
        ARRAY[]::integer[]
      ) AS actual_option_indexes
    FROM pg_temp.expected_started_question_sentiments AS expected
    LEFT JOIN public.survey_response_options AS option
      ON option.question_id = expected.question_id
    GROUP BY expected.question_id, expected.expected_sentiments
  )
  SELECT count(*)
  INTO option_shape_mismatches
  FROM per_question
  WHERE expected_sentiments IS NULL
     OR actual_option_indexes IS DISTINCT FROM
       CASE
         WHEN cardinality(expected_sentiments) = 0 THEN ARRAY[]::integer[]
         ELSE ARRAY(
           SELECT generate_series(0, cardinality(expected_sentiments) - 1)
         )
       END;

  IF question_index_mismatches <> 0 THEN
    RAISE EXCEPTION
      'Survey question shape verification failed: % surveys',
      question_index_mismatches;
  END IF;

  IF option_shape_mismatches <> 0 THEN
    RAISE EXCEPTION
      'Survey option shape verification failed: % questions',
      option_shape_mismatches;
  END IF;
END;
$$;

CREATE TEMP TABLE expected_started_option_sentiments (
  option_id uuid PRIMARY KEY,
  question_id uuid NOT NULL,
  expected_sentiment text NOT NULL
) ON COMMIT DROP;

INSERT INTO pg_temp.expected_started_option_sentiments (
  option_id,
  question_id,
  expected_sentiment
)
SELECT
  option.id,
  expected.question_id,
  expected.expected_sentiments[option.order_index + 1]
FROM pg_temp.expected_started_question_sentiments AS expected
JOIN public.survey_response_options AS option
  ON option.question_id = expected.question_id;

UPDATE public.survey_response_options AS option
SET sentiment = expected.expected_sentiment
FROM pg_temp.expected_started_option_sentiments AS expected
WHERE option.id = expected.option_id
  AND option.sentiment IS DISTINCT FROM expected.expected_sentiment;

UPDATE public.survey_questions AS question
SET sentiment_enabled = (
  array_position(expected.expected_sentiments, 'positive') IS NOT NULL
  OR array_position(expected.expected_sentiments, 'negative') IS NOT NULL
)
FROM pg_temp.expected_started_question_sentiments AS expected
WHERE question.id = expected.question_id
  AND question.sentiment_enabled IS DISTINCT FROM (
    array_position(expected.expected_sentiments, 'positive') IS NOT NULL
    OR array_position(expected.expected_sentiments, 'negative') IS NOT NULL
  );

DO $$
DECLARE
  question_mismatches integer;
  option_mismatches integer;
  excluded_mismatches integer;
  selected_negative_answers integer;
  selected_no_answer_values integer;
  selected_nonpositive_answers integer;
BEGIN
  SELECT count(*)
  INTO option_mismatches
  FROM pg_temp.expected_started_option_sentiments AS expected
  JOIN public.survey_response_options AS option
    ON option.id = expected.option_id
  WHERE option.sentiment IS DISTINCT FROM expected.expected_sentiment;

  SELECT count(*)
  INTO question_mismatches
  FROM pg_temp.expected_started_question_sentiments AS expected
  JOIN public.survey_questions AS question
    ON question.id = expected.question_id
  WHERE question.sentiment_enabled IS DISTINCT FROM (
    array_position(expected.expected_sentiments, 'positive') IS NOT NULL
    OR array_position(expected.expected_sentiments, 'negative') IS NOT NULL
  );

  SELECT count(*)
  INTO excluded_mismatches
  FROM pg_temp.zero_survey_sentiment_snapshot AS snapshot
  LEFT JOIN public.survey_questions AS question
    ON snapshot.record_type = 'question' AND question.id = snapshot.id
  LEFT JOIN public.survey_response_options AS option
    ON snapshot.record_type = 'option' AND option.id = snapshot.id
  WHERE CASE snapshot.record_type
    WHEN 'question' THEN question.sentiment_enabled::text
    WHEN 'option' THEN option.sentiment
  END IS DISTINCT FROM snapshot.sentiment_value;

  SELECT count(*)
  INTO selected_negative_answers
  FROM public.survey_individual_responses AS response
  JOIN pg_temp.started_survey_sentiment_scope AS scope
    ON scope.survey_id = response.survey_id
  JOIN public.survey_response_options AS option
    ON option.id = response.option_id
  WHERE option.sentiment = 'negative';

  SELECT count(*)
  INTO selected_no_answer_values
  FROM public.survey_individual_responses AS response
  JOIN pg_temp.started_survey_sentiment_scope AS scope
    ON scope.survey_id = response.survey_id
  LEFT JOIN public.survey_response_options AS option
    ON option.id = response.option_id
  WHERE coalesce(option.label, '') LIKE '%بدون پاسخ%'
     OR coalesce(response.text_answer, '') LIKE '%بدون پاسخ%';

  SELECT count(*)
  INTO selected_nonpositive_answers
  FROM public.survey_individual_responses AS response
  JOIN pg_temp.expected_started_question_sentiments AS expected
    ON expected.question_id = response.question_id
  LEFT JOIN public.survey_response_options AS option
    ON option.id = response.option_id
  WHERE array_position(expected.expected_sentiments, 'positive') IS NOT NULL
    AND coalesce(option.sentiment, '') <> 'positive';

  IF question_mismatches <> 0 THEN
    RAISE EXCEPTION
      'Survey question sentiment verification failed: % mismatches',
      question_mismatches;
  END IF;

  IF option_mismatches <> 0 THEN
    RAISE EXCEPTION
      'Survey option sentiment verification failed: % mismatches',
      option_mismatches;
  END IF;

  IF excluded_mismatches <> 0 THEN
    RAISE EXCEPTION
      'Zero-response survey metadata changed: % mismatches',
      excluded_mismatches;
  END IF;

  IF selected_negative_answers <> 0 THEN
    RAISE EXCEPTION
      'Negative individual answers remain: % rows',
      selected_negative_answers;
  END IF;

  IF selected_no_answer_values <> 0 THEN
    RAISE EXCEPTION
      'No-answer individual values remain: % rows',
      selected_no_answer_values;
  END IF;

  IF selected_nonpositive_answers <> 0 THEN
    RAISE EXCEPTION
      'Non-positive evaluative individual answers remain: % rows',
      selected_nonpositive_answers;
  END IF;
END;
$$;
