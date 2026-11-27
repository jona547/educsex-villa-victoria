CREATE TABLE IF NOT EXISTS public.roles (
    id INTEGER PRIMARY KEY,
    nombre_rol TEXT NOT NULL UNIQUE
);

INSERT INTO public.roles (id, nombre_rol)
VALUES
    (1, 'Administrador'),
    (2, 'Usuario General')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.perfiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nombre_completo TEXT NOT NULL,
    correo TEXT NOT NULL UNIQUE,
    edad_o_grupo TEXT,
    rol_id INTEGER NOT NULL DEFAULT 2 REFERENCES public.roles(id),
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.perfiles (id, nombre_completo, correo, edad_o_grupo, rol_id)
    VALUES (
        NEW.id,
        COALESCE(NULLIF(NEW.raw_user_meta_data->>'nombre_completo', ''), 'Usuario EducSex'),
        NEW.email,
        NULLIF(NEW.raw_user_meta_data->>'edad_o_grupo', ''),
        COALESCE((NEW.raw_user_meta_data->>'rol_id')::INTEGER, 2)
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE IF NOT EXISTS public.centros_salud (
    id BIGSERIAL PRIMARY KEY,
    nombre TEXT NOT NULL,
    institucion TEXT NOT NULL,
    direccion TEXT NOT NULL,
    servicios_jovenes TEXT,
    latitud DOUBLE PRECISION NOT NULL,
    longitud DOUBLE PRECISION NOT NULL,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.contenidos_normativos (
    id BIGSERIAL PRIMARY KEY,
    titulo TEXT NOT NULL,
    fuente_institucional TEXT NOT NULL,
    categoria TEXT NOT NULL,
    resumen TEXT NOT NULL,
    url_oficial TEXT,
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.preguntas_evaluacion (
    id BIGSERIAL PRIMARY KEY,
    tipo_modulo TEXT NOT NULL CHECK (tipo_modulo IN ('mitos_realidades', 'test_educativo', 'estadistica_impacto')),
    enunciado TEXT NOT NULL,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.evaluaciones (
    id BIGSERIAL PRIMARY KEY,
    usuario_id UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
    modulo TEXT NOT NULL CHECK (modulo IN ('mitos_realidades', 'test_educativo', 'estadistica_impacto')),
    puntaje_obtenido INTEGER NOT NULL DEFAULT 0,
    total_reactivos INTEGER NOT NULL DEFAULT 0,
    porcentaje NUMERIC(5,2) NOT NULL DEFAULT 0,
    fecha_realizacion TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.respuestas_evaluacion (
    id BIGSERIAL PRIMARY KEY,
    evaluacion_id BIGINT NOT NULL REFERENCES public.evaluaciones(id) ON DELETE CASCADE,
    pregunta_id BIGINT REFERENCES public.preguntas_evaluacion(id) ON DELETE SET NULL,
    respuesta_elegida TEXT NOT NULL,
    es_correcta BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS public.estadisticas_chat_anonimo (
    id BIGSERIAL PRIMARY KEY,
    tema_detectado TEXT NOT NULL UNIQUE,
    total_consultas INTEGER NOT NULL DEFAULT 1,
    ultima_consulta TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.logs_actividad_sistema (
    id BIGSERIAL PRIMARY KEY,
    usuario_id UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
    usuario_nombre TEXT NOT NULL,
    usuario_correo TEXT NOT NULL,
    rol_nombre TEXT NOT NULL,
    modulo TEXT NOT NULL,
    accion TEXT NOT NULL,
    detalle TEXT,
    fecha_evento TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.centros_salud ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contenidos_normativos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preguntas_evaluacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.respuestas_evaluacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estadisticas_chat_anonimo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logs_actividad_sistema ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lectura publica roles" ON public.roles;
CREATE POLICY "Lectura publica roles" ON public.roles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Lectura perfiles autenticados" ON public.perfiles;
CREATE POLICY "Lectura perfiles autenticados" ON public.perfiles FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Actualizar propio perfil" ON public.perfiles;
CREATE POLICY "Actualizar propio perfil" ON public.perfiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Lectura publica centros" ON public.centros_salud;
CREATE POLICY "Lectura publica centros" ON public.centros_salud FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin gestiona centros" ON public.centros_salud;
CREATE POLICY "Admin gestiona centros" ON public.centros_salud FOR ALL
USING (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol_id = 1))
WITH CHECK (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol_id = 1));

DROP POLICY IF EXISTS "Lectura publica normativa" ON public.contenidos_normativos;
CREATE POLICY "Lectura publica normativa" ON public.contenidos_normativos FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin gestiona normativa" ON public.contenidos_normativos;
CREATE POLICY "Admin gestiona normativa" ON public.contenidos_normativos FOR ALL
USING (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol_id = 1))
WITH CHECK (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol_id = 1));

DROP POLICY IF EXISTS "Lectura preguntas" ON public.preguntas_evaluacion;
CREATE POLICY "Lectura preguntas" ON public.preguntas_evaluacion FOR SELECT USING (true);

DROP POLICY IF EXISTS "Usuarios insertan evaluaciones" ON public.evaluaciones;
CREATE POLICY "Usuarios insertan evaluaciones" ON public.evaluaciones FOR INSERT WITH CHECK (auth.uid() = usuario_id);

DROP POLICY IF EXISTS "Lectura evaluaciones" ON public.evaluaciones;
CREATE POLICY "Lectura evaluaciones" ON public.evaluaciones FOR SELECT
USING (auth.uid() = usuario_id OR EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol_id = 1));

DROP POLICY IF EXISTS "Usuarios insertan respuestas" ON public.respuestas_evaluacion;
CREATE POLICY "Usuarios insertan respuestas" ON public.respuestas_evaluacion FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Lectura respuestas" ON public.respuestas_evaluacion;
CREATE POLICY "Lectura respuestas" ON public.respuestas_evaluacion FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Lectura estadisticas chat" ON public.estadisticas_chat_anonimo;
CREATE POLICY "Lectura estadisticas chat" ON public.estadisticas_chat_anonimo FOR SELECT USING (true);

DROP POLICY IF EXISTS "Insertar estadisticas chat" ON public.estadisticas_chat_anonimo;
CREATE POLICY "Insertar estadisticas chat" ON public.estadisticas_chat_anonimo FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Actualizar estadisticas chat" ON public.estadisticas_chat_anonimo;
CREATE POLICY "Actualizar estadisticas chat" ON public.estadisticas_chat_anonimo FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Insertar logs actividad" ON public.logs_actividad_sistema;
CREATE POLICY "Insertar logs actividad" ON public.logs_actividad_sistema FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admin lee logs actividad" ON public.logs_actividad_sistema;
CREATE POLICY "Admin lee logs actividad" ON public.logs_actividad_sistema FOR SELECT
USING (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol_id = 1));

INSERT INTO public.centros_salud (nombre, institucion, direccion, servicios_jovenes, latitud, longitud)
VALUES
    ('Centro Médico Villa Victoria', 'Atención 24 Horas', 'C. Lázaro Cárdenas MZ 014, Jesús María, Villa Victoria, Méx.', 'Consulta médica general, entrega gratuita de condones, orientación anticonceptiva y consejería confidencial. (24 hrs)', 19.4380, -99.9980),
    ('Casa de Salud San Isidro', 'Centro Comunitario', 'MZ 004, San Isidro, Villa Victoria, Estado de México.', 'Medicina preventiva, talleres de salud sexual para jóvenes, planificación familiar y consulta comunitaria.', 19.4425, -100.0050),
    ('Hospital Municipal Villa Victoria', 'IMSS Bienestar / Salud EDOMEX', 'Carretera Toluca - Zitácuaro Km 45, Villa Victoria, Méx.', 'Atención integral juvenil, planificación familiar, salud reproductiva, urgencias y orientación médica.', 19.4360, -99.9950),
    ('Unidad Médica DIF Comunitario', 'Atención Social', 'Calle Hidalgo #45, Col. Juárez, Villa Victoria, Méx.', 'Orientación psicológica, prevención del embarazo adolescente, asesoría médica básica y apoyo juvenil.', 19.4395, -99.9995),
    ('UMF No. 243 IMSS Villa Victoria', 'IMSS', 'Av. Vialidad Lázaro Cárdenas S/N, Col. Jesús María, 50960 Villa Victoria, Méx.', 'Medicina familiar, salud reproductiva, métodos anticonceptivos y prevención de ITS.', 19.4372, -99.9971),
    ('Laboratorio Médico Leben Lab', 'Laboratorio Médico', 'Av. Lázaro Cárdenas S/N, Jesús María, Manzana 012, 50960 Villa Victoria, Méx.', 'Análisis clínicos, pruebas de embarazo e infecciones de transmisión sexual (ITS).', 19.4386, -99.9977);