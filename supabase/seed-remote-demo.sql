-- Remote demo seed — explicitly requested by the project owner for testing.
-- Every row carries is_demo = true so the UI labels it as sample data
-- (RULE.md §9.1). Never presented as production telemetry.
--
-- Idempotent: safe to re-run. Skips users that already have projects.
-- Run with:
--   supabase db query --linked -f supabase/seed-remote-demo.sql
--
-- Covers: organizations, memberships, projects (6 demo projects per user),
-- services, service_health_checks (source='simulation' for failing demo
-- readings), incidents, incident_events, incident_evidence, ai_analyses
-- (deterministic test provider only), remediation_actions (allowlisted
-- action_type only), verification_runs.

DO $$
DECLARE
  u RECORD;
  v_org_id uuid;
  v_payments_id uuid;
  v_analytics_id uuid;
  v_shopeasy_id uuid;
  v_svc_gateway uuid;
  v_svc_orders uuid;
  v_svc_analytics uuid;
  v_inc1 uuid;
  v_inc2 uuid;
  v_ai1 uuid;
  v_rem1 uuid;
  v_existing int;
BEGIN
  FOR u IN
    SELECT id FROM auth.users
    WHERE id IN (
      'b55c76f1-d104-4afb-86a8-1e5ebaf2e856'::uuid,
      '83a21ef7-40c3-4417-b6c9-0b88e1d53f25'::uuid
    )
  LOOP
    -- Skip users that already own projects (mirrors /api/dev/seed idempotency).
    SELECT count(*) INTO v_existing
    FROM public.projects p
    JOIN public.organizations o ON o.id = p.organization_id
    WHERE o.created_by = u.id;
    IF v_existing > 0 THEN
      RAISE NOTICE 'User % already has % project(s) — skipping project insert.', u.id, v_existing;
    ELSE
      -- Org per user.
      SELECT id INTO v_org_id FROM public.organizations
      WHERE created_by = u.id AND name = 'Demo Workspace' LIMIT 1;
      IF v_org_id IS NULL THEN
        INSERT INTO public.organizations (name, created_by)
        VALUES ('Demo Workspace', u.id)
        RETURNING id INTO v_org_id;
        RAISE NOTICE 'Created Demo Workspace % for user %.', v_org_id, u.id;
      END IF;

      -- Owner membership (idempotent).
      INSERT INTO public.organization_members (organization_id, user_id, role)
      VALUES (v_org_id, u.id, 'owner')
      ON CONFLICT (organization_id, user_id) DO NOTHING;

      -- Six demo projects mirroring lib/projects/demo-data.ts.
      INSERT INTO public.projects
        (organization_id, name, slug, created_by, created_at, environment, repository,
         health, service_count, active_incident_count, last_checked_at,
         health_warning, deployment_version, deployment_commit, deployment_status,
         deployed_at, is_demo)
      VALUES
        (v_org_id, 'ShopEasy', 'shopeasy', u.id, now() - interval '41 days',
         'Production', 'github.com/company/shopeasy',
         'healthy', 12, 0, now() - interval '12 seconds',
         NULL, 'v1.8.2', 'a8f302', 'success', now() - interval '24 minutes', true),
        (v_org_id, 'Payments API', 'payments-api', u.id, now() - interval '33 days',
         'Production', 'github.com/company/payments-service',
         'warning', 8, 2, now() - interval '4 seconds',
         'High query queue contention on orders_db (latency +42%)',
         'v2.4.0', 'f41c9b', 'success', now() - interval '120 minutes', true),
        (v_org_id, 'Analytics Platform', 'analytics-engine', u.id, now() - interval '27 days',
         'Production', 'github.com/company/analytics-engine',
         'critical', 15, 1, now() - interval '2 seconds',
         'PostgreSQL pool exhausted on worker-node-04',
         'v1.1.9', 'e3290b', 'failed', now() - interval '8 minutes', true),
        (v_org_id, 'Marketing Platform', 'marketing-web', u.id, now() - interval '18 days',
         'Staging', 'github.com/company/marketing-web',
         'healthy', 6, 0, now() - interval '35 seconds',
         NULL, 'v3.12.0', 'c4819a', 'success', now() - interval '240 minutes', true),
        (v_org_id, 'Identity & Auth Core', 'auth-core', u.id, now() - interval '62 days',
         'Production', 'github.com/company/auth-core',
         'healthy', 4, 0, now() - interval '18 seconds',
         NULL, 'v4.0.1', '9b224e', 'success', now() - interval '1440 minutes', true),
        (v_org_id, 'Notification Dispatcher', 'notifications-worker', u.id, now() - interval '12 days',
         'Production', 'github.com/company/notifications-worker',
         'warning', 5, 1, now() - interval '60 seconds',
         'SendGrid queue retry threshold exceeded (p99 1.2s)',
         'v1.9.4', '71ec0a', 'success', now() - interval '300 minutes', true)
      ON CONFLICT (organization_id, slug) DO NOTHING;
    END IF;

    -- Resolve key project ids for this user's org.
    SELECT id INTO v_org_id FROM public.organizations
    WHERE created_by = u.id AND name = 'Demo Workspace' LIMIT 1;

    SELECT id INTO v_payments_id FROM public.projects
    WHERE organization_id = v_org_id AND slug = 'payments-api' LIMIT 1;
    SELECT id INTO v_analytics_id FROM public.projects
    WHERE organization_id = v_org_id AND slug = 'analytics-engine' LIMIT 1;
    SELECT id INTO v_shopeasy_id FROM public.projects
    WHERE organization_id = v_org_id AND slug = 'shopeasy' LIMIT 1;

    -- Services for Payments API (only if none yet).
    IF v_payments_id IS NOT NULL THEN
      SELECT count(*) INTO v_existing FROM public.services
      WHERE project_id = v_payments_id;
      IF v_existing = 0 THEN
        INSERT INTO public.services (project_id, name, kind, status, description, is_demo)
        VALUES
          (v_payments_id, 'payments-gateway', 'api', 'critical',
           'Demo payment gateway — simulated failure for testing detection.', true),
          (v_payments_id, 'orders-db', 'database', 'warning',
           'Demo orders database — simulated queue contention.', true),
          (v_payments_id, 'auth-service', 'api', 'healthy', 'Demo auth dependency.', true);
        RAISE NOTICE 'Seeded 3 demo services for payments-api (user %).', u.id;
      END IF;
    END IF;

    -- Service for Analytics Platform.
    IF v_analytics_id IS NOT NULL THEN
      SELECT count(*) INTO v_existing FROM public.services
      WHERE project_id = v_analytics_id;
      IF v_existing = 0 THEN
        INSERT INTO public.services (project_id, name, kind, status, description, is_demo)
        VALUES
          (v_analytics_id, 'analytics-worker', 'worker', 'critical',
           'Demo analytics worker — simulated pool exhaustion.', true);
        RAISE NOTICE 'Seeded 1 demo service for analytics-engine (user %).', u.id;
      END IF;
    END IF;

    -- Service for ShopEasy (healthy baseline).
    IF v_shopeasy_id IS NOT NULL THEN
      SELECT count(*) INTO v_existing FROM public.services
      WHERE project_id = v_shopeasy_id;
      IF v_existing = 0 THEN
        INSERT INTO public.services (project_id, name, kind, status, description, is_demo)
        VALUES
          (v_shopeasy_id, 'storefront-web', 'web', 'healthy', 'Demo storefront.', true),
          (v_shopeasy_id, 'cart-api', 'api', 'healthy', 'Demo cart API.', true);
      END IF;
    END IF;

    -- Resolve service ids.
    SELECT id INTO v_svc_gateway FROM public.services
    WHERE project_id = v_payments_id AND name = 'payments-gateway' LIMIT 1;
    SELECT id INTO v_svc_orders FROM public.services
    WHERE project_id = v_payments_id AND name = 'orders-db' LIMIT 1;
    SELECT id INTO v_svc_analytics FROM public.services
    WHERE project_id = v_analytics_id AND name = 'analytics-worker' LIMIT 1;

    -- Simulated health readings (source='simulation' — never mistaken for probes).
    IF v_svc_gateway IS NOT NULL THEN
      SELECT count(*) INTO v_existing FROM public.service_health_checks
      WHERE service_id = v_svc_gateway AND is_demo;
      IF v_existing = 0 THEN
        INSERT INTO public.service_health_checks
          (project_id, service_id, status, source, latency_ms, error_rate, detail, is_demo, checked_at)
        VALUES
          (v_payments_id, v_svc_gateway, 'critical', 'simulation', 2450, 0.4200,
           'Simulated demo failure: error budget burn, p99 latency 2.45s.', true, now() - interval '6 minutes'),
          (v_payments_id, v_svc_gateway, 'critical', 'simulation', 2680, 0.5100,
           'Simulated demo failure: sustained 5xx spike on /charge.', true, now() - interval '2 minutes');
      END IF;
    END IF;

    IF v_svc_orders IS NOT NULL THEN
      SELECT count(*) INTO v_existing FROM public.service_health_checks
      WHERE service_id = v_svc_orders AND is_demo;
      IF v_existing = 0 THEN
        INSERT INTO public.service_health_checks
          (project_id, service_id, status, source, latency_ms, error_rate, detail, is_demo, checked_at)
        VALUES
          (v_payments_id, v_svc_orders, 'warning', 'simulation', 890, 0.0800,
           'Simulated demo degradation: query queue contention on orders_db.', true, now() - interval '4 minutes');
      END IF;
    END IF;

    IF v_svc_analytics IS NOT NULL THEN
      SELECT count(*) INTO v_existing FROM public.service_health_checks
      WHERE service_id = v_svc_analytics AND is_demo;
      IF v_existing = 0 THEN
        INSERT INTO public.service_health_checks
          (project_id, service_id, status, source, latency_ms, error_rate, detail, is_demo, checked_at)
        VALUES
          (v_analytics_id, v_svc_analytics, 'critical', 'simulation', 5200, 0.9500,
           'Simulated demo failure: PostgreSQL pool exhausted on worker-node-04.', true, now() - interval '8 minutes');
      END IF;
    END IF;

    -- Incidents + full lifecycle evidence for Payments API.
    IF v_payments_id IS NOT NULL AND v_svc_gateway IS NOT NULL THEN
      SELECT count(*) INTO v_existing FROM public.incidents
      WHERE project_id = v_payments_id AND is_demo;
      IF v_existing = 0 THEN
        INSERT INTO public.incidents
          (project_id, service_id, title, summary, severity, status, detected_at, created_by, is_demo)
        VALUES
          (v_payments_id, v_svc_gateway,
           'Demo: payments-gateway returning 5xx on /charge',
           'Simulated demo incident for testing observe → detect → investigate → AI → remediate → verify.',
           'critical', 'open', now() - interval '5 minutes', u.id, true)
        RETURNING id INTO v_inc1;

        INSERT INTO public.incident_events (incident_id, kind, message, actor, is_demo)
        VALUES
          (v_inc1, 'detected', 'Detected by monitor: payments-gateway health is critical (simulated).', 'system', true),
          (v_inc1, 'note', 'Demo incident created by seed for end-to-end UI testing.', 'user', true);

        INSERT INTO public.incident_evidence
          (incident_id, source, label, detail, observed_at, is_demo)
        VALUES
          (v_inc1, 'metric', 'Health check reading',
           'status=critical, latency=2680ms, error_rate=51.0%', now() - interval '2 minutes', true),
          (v_inc1, 'log', 'Simulated error log',
           'ERROR payments-gateway: POST /charge → 502 upstream timeout (simulated demo log).',
           now() - interval '3 minutes', true),
          (v_inc1, 'deployment', 'Deployment v2.4.0',
           'status=success, commit=f41c9b', now() - interval '120 minutes', true);

        INSERT INTO public.ai_analyses
          (incident_id, provider, model, observation, interpretation,
           confidence, confidence_rationale, suggested_action, is_demo, created_by)
        VALUES
          (v_inc1, 'test', 'deterministic-test',
           'Observation: payments-gateway reports critical with 51% errors and 2.68s p99 over the last 2 simulated checks.',
           'Interpretation (demo, not verified fact): the failure began shortly after deployment v2.4.0; evidence suggests a possible regression worth investigating.',
           'medium', 'Two consecutive simulated critical readings plus a recent deployment marker.',
           'Consider investigating the v2.4.0 diff and orders_db contention; restart of the demo service is available for approval.',
           true, u.id)
        RETURNING id INTO v_ai1;

        INSERT INTO public.remediation_actions
          (incident_id, ai_analysis_id, title, description, proposed_by, risk,
           status, requires_approval, action_type, is_demo)
        VALUES
          (v_inc1, v_ai1, 'Restart the affected demo service',
           'Restarts the simulated service and re-runs its health check. Acts only on demo/simulated state.',
           'ai', 'low', 'proposed', true, 'RESTART_DEMO_SERVICE', true)
        RETURNING id INTO v_rem1;

        INSERT INTO public.incident_events (incident_id, kind, message, actor, is_demo, metadata)
        VALUES
          (v_inc1, 'remediation_proposed', 'AI proposed: Restart the affected demo service (awaiting human approval).',
           'ai', true, jsonb_build_object('remediation_action_id', v_rem1));

        -- Second incident on orders-db (investigating, no AI yet).
        INSERT INTO public.incidents
          (project_id, service_id, title, summary, severity, status, detected_at, created_by, is_demo)
        VALUES
          (v_payments_id, v_svc_orders,
           'Demo: orders_db query queue contention',
           'Simulated warning for testing multi-incident views.', 'high',
           'investigating', now() - interval '30 minutes', u.id, true)
        RETURNING id INTO v_inc2;

        INSERT INTO public.incident_events (incident_id, kind, message, actor, is_demo)
        VALUES
          (v_inc2, 'detected', 'Detected by monitor: orders-db health is warning (simulated).', 'system', true);

        INSERT INTO public.incident_evidence (incident_id, source, label, detail, observed_at, is_demo)
        VALUES
          (v_inc2, 'metric', 'Health check reading',
           'status=warning, latency=890ms, error_rate=8.0%', now() - interval '4 minutes', true);

        RAISE NOTICE 'Seeded 2 demo incidents for payments-api (user %).', u.id;
      END IF;
    END IF;

    -- One critical incident for Analytics Platform.
    IF v_analytics_id IS NOT NULL AND v_svc_analytics IS NOT NULL THEN
      SELECT count(*) INTO v_existing FROM public.incidents
      WHERE project_id = v_analytics_id AND is_demo;
      IF v_existing = 0 THEN
        INSERT INTO public.incidents
          (project_id, service_id, title, summary, severity, status, detected_at, created_by, is_demo)
        VALUES
          (v_analytics_id, v_svc_analytics,
           'Demo: analytics-worker pool exhausted',
           'Simulated critical for testing the critical path.', 'critical',
           'open', now() - interval '8 minutes', u.id, true)
        RETURNING id INTO v_inc2;

        INSERT INTO public.incident_events (incident_id, kind, message, actor, is_demo)
        VALUES
          (v_inc2, 'detected', 'Detected by monitor: analytics-worker health is critical (simulated).', 'system', true);

        INSERT INTO public.incident_evidence (incident_id, source, label, detail, observed_at, is_demo)
        VALUES
          (v_inc2, 'metric', 'Health check reading',
           'status=critical, latency=5200ms, error_rate=95.0%', now() - interval '8 minutes', true);
      END IF;
    END IF;
  END LOOP;
END
$$;
