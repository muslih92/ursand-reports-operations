REVOKE EXECUTE ON FUNCTION public.security_test_report() FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.security_regression_report() FROM authenticated, anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.security_test_report() TO service_role;
GRANT EXECUTE ON FUNCTION public.security_regression_report() TO service_role;