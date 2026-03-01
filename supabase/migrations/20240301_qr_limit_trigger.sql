-- ============================================
-- QR SYSTEM LIMIT TRIGGER
-- ============================================

-- Função para validar o limite antes da inserção
CREATE OR REPLACE FUNCTION public.check_qr_limit()
RETURNS TRIGGER AS $$
DECLARE
    v_max_uses INTEGER;
    v_current_uses INTEGER;
BEGIN
    -- 1. Obter o limite global do código
    SELECT max_uses_global INTO v_max_uses
    FROM public.qr_codes
    WHERE id = NEW.qr_code_id;

    -- 2. Se houver limite, validar
    IF v_max_uses IS NOT NULL THEN
        SELECT COUNT(*) INTO v_current_uses
        FROM public.qr_scans
        WHERE qr_code_id = NEW.qr_code_id;

        IF v_current_uses >= v_max_uses THEN
            RAISE EXCEPTION 'Este código já atingiu o limite máximo de resgates (%)', v_max_uses;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para executar antes de inserir um novo scan
DROP TRIGGER IF EXISTS tr_check_qr_limit ON public.qr_scans;
CREATE TRIGGER tr_check_qr_limit
    BEFORE INSERT ON public.qr_scans
    FOR EACH ROW
    EXECUTE FUNCTION public.check_qr_limit();

COMMENT ON FUNCTION public.check_qr_limit IS 'Prevents inserting more scans than allowed by qr_codes.max_uses_global.';
