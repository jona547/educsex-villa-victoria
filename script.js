import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = 'https://jmvolxvcerozduzocjuu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_xLG13aabtLCYL3pg-QHMVA_Jn8O_gIH';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession: false,
        autoRefreshToken: false
    }
});

let usuarioActual = null;
let perfilActual = null;
let modoRegistro = true;
let evaluacionActivaId = null;
let modoConversacionChat = 'privada';
let logsAuditoriaCache = [];

const avataresDisponibles = ['👤', '🧑‍🎓', '👩‍🎓', '🛡️', '🩺'];
let avatarIdx = 0;

async function registrarMovimientoUsuario(modulo, accion, detalle = '') {
    if (!usuarioActual) return;

    const nombreUsuario = perfilActual?.nombre_completo || usuarioActual.email || 'Usuario';
    const correoUsuario = perfilActual?.correo || usuarioActual.email || 'Sin correo';
    const rolNombre = perfilActual?.roles?.nombre_rol || (perfilActual?.rol_id === 1 ? 'Administrador' : 'Usuario General');

    try {
        await supabase.from('logs_actividad_sistema').insert({
            usuario_id: usuarioActual.id,
            usuario_nombre: nombreUsuario,
            usuario_correo: correoUsuario,
            rol_nombre: rolNombre,
            modulo,
            accion,
            detalle
        });
    } catch (err) {
        console.error('Error registrando movimiento de auditoría:', err);
    }
}

function actualizarVisibilidadNavegacion() {
    const botonesPrivados = document.querySelectorAll('.nav-privado');
    const haySesion = Boolean(usuarioActual);

    botonesPrivados.forEach(btn => {
        btn.classList.toggle('hidden', !haySesion);
    });

    document.getElementById('btnNavLogin')?.classList.add('hidden');
    document.getElementById('navPerfilDropdown')?.classList.toggle('hidden', !haySesion);

    const esAdmin = haySesion && (perfilActual?.rol_id === 1 || perfilActual?.roles?.nombre_rol === 'Administrador');
    document.getElementById('btnNavAdmin')?.classList.toggle('hidden', !esAdmin);
}

function toggleMenuPerfil() {
    document.getElementById('menuDesplegablePerfil')?.classList.toggle('hidden');
}

function irAPerfilSeccion(seccion) {
    document.getElementById('menuDesplegablePerfil')?.classList.add('hidden');
    mostrarPantalla('perfil');
    if (seccion === 'seguridad') {
        document.getElementById('seccionSeguridadPerfil')?.scrollIntoView({ behavior: 'smooth' });
    }
}

document.addEventListener('click', (e) => {
    const wrapper = document.getElementById('navPerfilDropdown');
    const menu = document.getElementById('menuDesplegablePerfil');
    if (wrapper && menu && !wrapper.contains(e.target)) {
        menu.classList.add('hidden');
    }
});

async function mostrarPantalla(idPantalla) {
    if (!usuarioActual && idPantalla !== 'login' && idPantalla !== 'bienvenida') {
        idPantalla = 'bienvenida';
    }

    const pantallaActualActiva = document.querySelector('.screen.active');
    if (pantallaActualActiva && pantallaActualActiva.id === 'pantalla-chatbot' && idPantalla !== 'chatbot') {
        reiniciarChat();
    }

    const pantallas = document.querySelectorAll('.screen');
    pantallas.forEach(p => p.classList.remove('active'));

    const pantallaDestino = document.getElementById('pantalla-' + idPantalla);
    if (pantallaDestino) {
        pantallaDestino.classList.add('active');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    if (usuarioActual && idPantalla !== 'login' && idPantalla !== 'bienvenida') {
        registrarMovimientoUsuario('Navegación', 'Cambio de vista', `Abrió pantalla: ${idPantalla}`);
    }

    if (idPantalla === 'geolocalizacion') {
        await cargarCentrosDesdeSupabase();
    } else if (idPantalla === 'normativa') {
        await cargarNormativaDesdeSupabase();
    } else if (idPantalla === 'mitos') {
        await cargarMitosDesdeSupabase();
        await cargarHistorialEvaluacionesEnTablas();
    } else if (idPantalla === 'test') {
        await cargarTestDesdeSupabase();
        await cargarHistorialEvaluacionesEnTablas();
    } else if (idPantalla === 'estadistica') {
        iniciarImpactoQuiz();
        await cargarHistorialEvaluacionesEnTablas();
    } else if (idPantalla === 'perfil') {
        await cargarDatosEnFormularioPerfil();
    } else if (idPantalla === 'admin') {
        await cargarPanelAdmin();
    }
}

function actualizarEtiquetaModoChat() {
    const badge = document.getElementById('estadoModoChatTexto');
    const select = document.getElementById('selectModoChat');
    if (select && select.value !== modoConversacionChat) {
        select.value = modoConversacionChat;
    }
    if (!badge) return;

    if (modoConversacionChat === 'privada') {
        badge.className = 'badge-privado';
        badge.innerText = '🔒 Conversación Privada (No se guarda nada)';
    } else {
        badge.className = 'badge-publico';
        badge.innerText = '🌐 Conversación Pública (Registra métricas anónimas)';
    }
}

function cambiarModoConversacionChat() {
    const select = document.getElementById('selectModoChat');
    if (!select) return;
    modoConversacionChat = select.value;
    actualizarEtiquetaModoChat();

    if (modoConversacionChat === 'privada') {
        agregarMensajeAlChat(
            '🔒 Conversación configurada en modo <strong>privado</strong>.<br>1. No se guardará nada en el historial ni en estadísticas.<br>2. El administrador no podrá ver consultas ni registros de este modo.',
            'bot'
        );
    } else {
        registrarMovimientoUsuario('Chatbot', 'Activó modo público', 'El usuario habilitó métricas de consulta');
        agregarMensajeAlChat(
            '🌐 Conversación configurada en modo <strong>público</strong>.<br>1. Se contabiliza el tema de consulta en la consola.<br>2. Puedes volver a <strong>privado</strong> en cualquier momento.',
            'bot'
        );
    }
}

function enviarMensajeUsuario() {
    const input = document.getElementById('chatInput');
    const mensaje = input.value.trim();
    if (mensaje === '') return;

    agregarMensajeAlChat(mensaje, 'user');
    input.value = '';

    setTimeout(() => {
        const { tema, respuesta, omitirRegistro } = analizarConsultaBot(mensaje);
        agregarMensajeAlChat(respuesta, 'bot');
        if (!omitirRegistro && modoConversacionChat === 'publica') {
            registrarEstadisticaAnonima(tema);
            registrarMovimientoUsuario('Chatbot', 'Consulta pública', `Tema: ${tema} | Pregunta: ${mensaje}`);
        }
    }, 450);
}

function enviarMensajePreset(texto) {
    agregarMensajeAlChat(texto, 'user');
    setTimeout(() => {
        const { tema, respuesta, omitirRegistro } = analizarConsultaBot(texto);
        agregarMensajeAlChat(respuesta, 'bot');
        if (!omitirRegistro && modoConversacionChat === 'publica') {
            registrarEstadisticaAnonima(tema);
            registrarMovimientoUsuario('Chatbot', 'Consulta rápida pública', `Tema: ${tema} | Botón: ${texto}`);
        }
    }, 450);
}

function manejarEnter(e) {
    if (e.key === 'Enter') {
        enviarMensajeUsuario();
    }
}

function agregarMensajeAlChat(texto, tipo) {
    const chatHistory = document.getElementById('chatHistory');
    const divMsg = document.createElement('div');
    divMsg.className = `chat-msg ${tipo}`;

    if (tipo === 'bot') {
        divMsg.innerHTML = `<span class="msg-author"><img src="chatbot-avatar.jpeg" alt="Bot" class="msg-avatar-icon" onerror="this.style.display='none'"> Chatbot EducSex</span><p>${texto}</p>`;
    } else {
        divMsg.innerHTML = `<span class="msg-author">👤 Tú</span><p>${texto}</p>`;
    }

    chatHistory.appendChild(divMsg);
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

function reiniciarChat() {
    modoConversacionChat = 'privada';
    actualizarEtiquetaModoChat();
    const chatHistory = document.getElementById('chatHistory');
    if (chatHistory) {
        chatHistory.innerHTML = `
            <div class="chat-msg bot">
                <span class="msg-author"><img src="chatbot-avatar.jpeg" alt="Bot" class="msg-avatar-icon" onerror="this.style.display='none'"> Chatbot EducSex</span>
                <p>¡Hola! 👋 ¿Cómo estás? Soy tu asistente virtual.<br>1. Puedes elegir arriba si quieres conversación <strong>privada</strong> o <strong>pública</strong>.<br>2. En modo <strong>privado</strong> no se guarda nada ni lo ve el administrador.<br>3. También puedes escribir <em>"privada"</em> o <em>"pública"</em>, o <em>"ver registro"</em> para consultar el estado actual.</p>
            </div>
        `;
    }
}

function analizarConsultaBot(pregunta) {
    const p = pregunta.toLowerCase().trim();

    if (p.includes('privad') || p.includes('no guardar') || p.includes('no se guarde')) {
        modoConversacionChat = 'privada';
        actualizarEtiquetaModoChat();
        return {
            tema: 'Modo Privado',
            omitirRegistro: true,
            respuesta: '🔒 Listo, tu conversación quedó en modo <strong>privado</strong>.<br>1. No se guarda ningún registro ni consulta.<br>2. El administrador no puede ver nada de lo que consultes en este modo.'
        };
    }

    if (p.includes('public') || p.includes('públic')) {
        modoConversacionChat = 'publica';
        actualizarEtiquetaModoChat();
        return {
            tema: 'Modo Público',
            omitirRegistro: true,
            respuesta: '🌐 Listo, tu conversación quedó en modo <strong>público</strong>.<br>1. Se registran métricas de temas consultados en la consola.<br>2. Si deseas que no se guarde nada, escribe <strong>"privada"</strong>.'
        };
    }

    if (p.includes('ver') && (p.includes('registro') || p.includes('historial') || p.includes('guardado') || p.includes('admin'))) {
        if (modoConversacionChat === 'privada') {
            return {
                tema: 'Consulta de Estado',
                omitirRegistro: true,
                respuesta: '🔒 Actualmente estás en conversación <strong>privada</strong>.<br>1. No hay nada guardado de esta conversación.<br>2. El administrador no tiene visibilidad de este modo.'
            };
        }
        return {
            tema: 'Consulta de Estado',
            omitirRegistro: true,
            respuesta: '🌐 Actualmente estás en conversación <strong>pública</strong>.<br>1. Las consultas públicas se reflejan en la consola de administración.<br>2. Si deseas que no se guarde nada, escribe <strong>"privada"</strong>.'
        };
    }

    if (p.includes('hola') || p.includes('buenas')) {
        return {
            tema: 'Saludo / Orientación General',
            respuesta: '¡Hola! 👋 Bienvenido a la orientación confidencial de <strong>EducSex Villa Victoria</strong>.<br>1. Puedo explicarte el uso correcto del condón y la PAE.<br>2. Puedo orientarte sobre prevención, tipos y detección de ITS.<br>3. Puedes consultar clínicas cercanas en Villa Victoria o cambiar entre modo <strong>privado</strong> y <strong>público</strong>.'
        };
    } else if (p.includes('como usar el condon') || p.includes('cómo usar el condón') || p.includes('usar condon')) {
        return {
            tema: 'Uso Correcto del Condón',
            respuesta: '🛡️ Pasos para usar el condón de forma segura:<br>1. Revisa la fecha de caducidad y que el empaque conserve aire o resistencia sin rasgaduras.<br>2. Ábrelo con las yemas de los dedos, sin usar dientes ni objetos filosos.<br>3. Colócalo cuando el pene esté erecto antes de cualquier contacto genital, presionando la punta para sacar el aire.<br>4. Desenróllalo hasta la base y, tras eyacular y antes de perder la erección, retíralo sujetándolo desde la base.<br>5. Usa uno nuevo en cada relación y nunca combines dos condones.'
        };
    } else if (p.includes('condon') || p.includes('preservativo') || p.includes('gratuito')) {
        return {
            tema: 'Condones y Métodos',
            respuesta: '📦 Información sobre preservativos gratuitos:<br>1. Se entregan de forma gratuita y confidencial en unidades de salud y servicios para jóvenes en Villa Victoria (como el Centro Médico Villa Victoria 24 hrs y la Casa de Salud San Isidro).<br>2. Es el único método que ayuda a prevenir embarazos no planeados y la transmisión de ITS al mismo tiempo.'
        };
    } else if (p.includes('como usar la pastilla') || p.includes('cómo usar la pastilla') || p.includes('usar la pae') || p.includes('como usar la pae')) {
        return {
            tema: 'Uso de la PAE',
            respuesta: '⏱️ Pasos generales sobre la Pastilla Anticonceptiva de Emergencia (PAE):<br>1. Tómala por vía oral lo antes posible tras una relación sexual sin protección o ante falla del condón (mayor eficacia dentro de las primeras 72 horas y hasta 120 horas según el tipo).<br>2. Sigue las indicaciones del empaque o del personal médico.<br>3. Recuerda que no protege ante relaciones posteriores en el mismo ciclo ni reemplaza a un método anticonceptivo regular.'
        };
    } else if (p.includes('emergencia') || p.includes('pae') || p.includes('pastilla')) {
        return {
            tema: 'Anticoncepción de Emergencia',
            respuesta: '💊 Orientación sobre anticoncepción de emergencia:<br>1. Es una medida de respaldo tras una relación sin protección o fallo del método habitual.<br>2. Actúa principalmente retrasando la ovulación y no interrumpe un embarazo ya establecido.<br>3. Acude a un centro de salud para recibir orientación médica gratuita y elegir un método regular si lo necesitas.'
        };
    } else if (p.includes('metodos anticonceptivos') || p.includes('métodos anticonceptivos') || p.includes('anticonceptivo')) {
        return {
            tema: 'Métodos Anticonceptivos',
            respuesta: '💡 Opciones anticonceptivas disponibles:<br>1. De barrera: condón masculino y condón femenino.<br>2. Hormonales: pastillas, inyecciones, parche e implante subdérmico.<br>3. Dispositivos intrauterinos: DIU.<br>4. Solicita consejería en un servicio amigable para elegir el método adecuado según tu salud y proyecto de vida.'
        };
    } else if (p.includes('tipos de its') || p.includes('cuales son las its') || p.includes('cuáles son las its')) {
        return {
            tema: 'Tipos de ITS',
            respuesta: '📋 Principales Infecciones de Transmisión Sexual (ITS):<br>1. VIH y Virus del Papiloma Humano (VPH).<br>2. Sífilis, gonorrea y clamidia.<br>3. Herpes genital.<br>4. Muchas pueden no mostrar síntomas visibles al inicio, por lo que la prevención y la revisión médica son clave.'
        };
    } else if (p.includes('deteccion') || p.includes('prueba') || p.includes('diagnostico')) {
        return {
            tema: 'Detección de ITS',
            respuesta: '🩺 Pasos para la detección oportuna de ITS:<br>1. Acude a valoración médica o consulta en un centro de salud o laboratorio.<br>2. Realiza las pruebas indicadas (análisis de sangre, muestra de orina o exudados según corresponda).<br>3. Un diagnóstico temprano permite iniciar tratamiento oportuno y cuidar tu salud y la de tu pareja.'
        };
    } else if (p.includes('its') || p.includes('infeccion') || p.includes('contagio')) {
        return {
            tema: 'Prevención y Contagio de ITS',
            respuesta: '🦠 Cómo se transmiten y previenen las ITS:<br>1. Se transmiten principalmente por contacto sexual vaginal, anal u oral sin protección (y en ciertos casos por vía sanguínea o perinatal).<br>2. Usar condón de forma correcta y constante en cada relación reduce el riesgo de transmisión.'
        };
    } else if (p.includes('primera vez') || p.includes('riesgo')) {
        return {
            tema: 'Riesgo en la Primera Vez',
            respuesta: '⚠️ Riesgos en la primera relación sexual:<br>1. Existe riesgo de embarazo no planeado y de contraer una ITS desde la primera relación sexual sin protección.<br>2. Contar con información previa y usar protección desde el inicio protege tu salud y tus planes.'
        };
    } else if (p.includes('confidencial') || p.includes('privacidad') || p.includes('anonim')) {
        return {
            tema: 'Confidencialidad y Derechos',
            respuesta: '🔒 Confidencialidad y derechos en salud sexual:<br>1. Conforme a la NOM-047-SSA2-2015, las y los adolescentes tienen derecho a orientación, consejería y métodos anticonceptivos gratuitos y confidenciales.<br>2. En este chat puedes usar el modo <strong>privado</strong> para que no se guarde nada ni lo vea el administrador.'
        };
    } else {
        return {
            tema: 'Otras Consultas',
            respuesta: 'Gracias por tu consulta.<br>1. Revisa el directorio y mapa de <strong>Centros de Salud</strong> en Villa Victoria.<br>2. También puedes llamar a la Línea de la Vida (<strong>800 911 2000</strong>) para orientación gratuita.'
        };
    }
}

async function registrarEstadisticaAnonima(temaDetectado) {
    if (modoConversacionChat === 'privada') return;
    const permitir = document.getElementById('chkAnonimoStats')?.checked ?? true;
    if (!permitir) return;

    try {
        const { data: registroExistente } = await supabase
            .from('estadisticas_chat_anonimo')
            .select('id, total_consultas')
            .eq('tema_detectado', temaDetectado)
            .maybeSingle();

        if (registroExistente) {
            await supabase
                .from('estadisticas_chat_anonimo')
                .update({
                    total_consultas: registroExistente.total_consultas + 1,
                    ultima_consulta: new Date().toISOString()
                })
                .eq('id', registroExistente.id);
        } else {
            await supabase
                .from('estadisticas_chat_anonimo')
                .insert({ tema_detectado: temaDetectado, total_consultas: 1 });
        }
    } catch (err) {
        console.error('Error estadística anónima:', err);
    }
}

const centrosRespaldo = [
    {
        nombre: 'Hospital Municipal Villa Victoria',
        institucion: 'IMSS Bienestar / Salud EDOMEX',
        direccion: 'Carretera Toluca - Zitácuaro Km 45, Villa Victoria, Méx.',
        servicios_jovenes: 'Atención integral juvenil, planificación familiar, salud reproductiva, urgencias y orientación médica.'
    },
    {
        nombre: 'Laboratorio Médico Leben Lab',
        institucion: 'Laboratorio Médico',
        direccion: 'Av. Lázaro Cárdenas S/N, Jesús María, Manzana 012, 50960 Villa Victoria, Méx.',
        servicios_jovenes: 'Análisis clínicos, pruebas de embarazo e infecciones de transmisión sexual (ITS).'
    },
    {
        nombre: 'Centro Médico Villa Victoria',
        institucion: 'Atención 24 Horas',
        direccion: 'C. Lázaro Cárdenas MZ 014, Jesús María, Villa Victoria, Méx.',
        servicios_jovenes: 'Consulta médica general, entrega gratuita de condones, orientación anticonceptiva y consejería confidencial. (24 hrs)'
    },
    {
        nombre: 'Clínica Jesús María 219',
        institucion: 'Unidad Médica Local',
        direccion: 'Jesús María, Villa Victoria, Estado de México.',
        servicios_jovenes: 'Consulta médica ambulatoria, prevención, orientación en salud sexual y seguimiento comunitario.'
    },
    {
        nombre: 'Casa de Salud San Isidro',
        institucion: 'Centro Comunitario',
        direccion: 'MZ 004, San Isidro, Villa Victoria, Estado de México.',
        servicios_jovenes: 'Medicina preventiva, talleres de salud sexual para jóvenes, planificación familiar y consulta comunitaria.'
    },
    {
        nombre: 'Unidad Médica DIF Comunitario',
        institucion: 'Atención Social',
        direccion: 'Calle Hidalgo #45, Col. Juárez, Villa Victoria, Méx.',
        servicios_jovenes: 'Orientación psicológica, prevención del embarazo adolescente, asesoría médica básica y apoyo juvenil.'
    },
    {
        nombre: 'UMF No. 243 IMSS Villa Victoria',
        institucion: 'IMSS',
        direccion: 'Av. Vialidad Lázaro Cárdenas S/N, Col. Jesús María, 50960 Villa Victoria, Méx.',
        servicios_jovenes: 'Medicina familiar, salud reproductiva, métodos anticonceptivos y prevención de ITS.'
    }
];

function cambiarUbicacionMapa(busqueda, nombreClinica = '') {
    const mapFrame = document.getElementById('googleMapFrame');
    if (mapFrame && busqueda) {
        mapFrame.src = `https://maps.google.com/maps?q=${encodeURIComponent(busqueda)}&t=&z=15&ie=UTF8&iwloc=&output=embed`;
        registrarMovimientoUsuario('Geolocalización', 'Consultó ruta en mapa', nombreClinica || busqueda);
    }
}

function buscarUbicacionPersonalizada() {
    const query = document.getElementById('geoSearchInput')?.value.trim();
    if (query) {
        cambiarUbicacionMapa(`${query}, Villa Victoria, Estado de México`, `Búsqueda: ${query}`);
    }
}

function obtenerUbicacionActual() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => cambiarUbicacionMapa(`${pos.coords.latitude},${pos.coords.longitude}`, 'GPS Mi Ubicación'),
            () => alert('No se pudo acceder a tu ubicación. Mostrando mapa de Villa Victoria.')
        );
    }
}

function filtrarClinicas(event) {
    const texto = event.target.value.toLowerCase();
    document.querySelectorAll('#listaGeoClinicas .clinic-card').forEach(card => {
        card.style.display = card.innerText.toLowerCase().includes(texto) ? 'block' : 'none';
    });
}

function renderizarListaCentros(centros) {
    const listaGeo = document.getElementById('listaGeoClinicas');
    if (!listaGeo) return;

    listaGeo.innerHTML = '';
    centros.forEach((centro, idx) => {
        const consultaMapa = centro.direccion
            ? `${centro.nombre}, ${centro.direccion}`
            : `${centro.nombre}, Villa Victoria, Estado de México`;

        const card = document.createElement('div');
        card.className = 'clinic-card';
        card.id = `clinic-${idx + 1}`;
        card.innerHTML = `
            <h4>🏥 ${centro.nombre}</h4>
            <p>📍 ${centro.direccion}</p>
            <p>🩺 ${centro.servicios_jovenes || centro.institucion}</p>
            <button type="button" class="btn-route">🗺️ Ver en Mapa / Ruta</button>
        `;
        card.querySelector('.btn-route').addEventListener('click', () => {
            cambiarUbicacionMapa(consultaMapa, centro.nombre);
        });
        listaGeo.appendChild(card);
    });
}

async function cargarCentrosDesdeSupabase() {
    const { data, error } = await supabase
        .from('centros_salud')
        .select('*')
        .order('id', { ascending: true });

    const centrosBD = (!error && Array.isArray(data)) ? data : [];
    const nombresExistentes = new Set(centrosBD.map(c => (c.nombre || '').trim().toLowerCase()));
    const adicionales = centrosRespaldo.filter(c => !nombresExistentes.has(c.nombre.trim().toLowerCase()));

    renderizarListaCentros([...centrosBD, ...adicionales]);
}

const normativaRespaldo = [
    {
        titulo: 'Derechos Sexuales y Reproductivos de Adolescentes (NOM-047-SSA2-2015)',
        fuente_institucional: 'Norma Oficial Mexicana / Secretaría de Salud',
        categoria: 'Marco Normativo',
        resumen: 'Establece criterios para la atención a la salud del grupo de 10 a 19 años: garantiza orientación, consejería, métodos anticonceptivos y atención en salud sexual y reproductiva de manera gratuita, respetuosa y confidencial.',
        url_oficial: 'https://www.gob.mx/salud/documentos/nom-047-ssa2-2015-para-la-atencion-a-la-salud-del-grupo-etario-de-10-a-19-anos-de-edad'
    },
    {
        titulo: 'Panorama Demográfico y Nacimientos en Villa Victoria y Estado de México',
        fuente_institucional: 'INEGI / Secretaría de Salud EDOMEX',
        categoria: 'Estadística Local',
        resumen: 'Los registros demográficos y de nacimientos permiten observar el comportamiento poblacional en Villa Victoria y el Estado de México, evidenciando la importancia de acercar información preventiva y servicios médicos a las y los jóvenes.',
        url_oficial: 'https://www.inegi.org.mx/app/cuadroentidad/Mex/2018/03/3_6'
    },
    {
        titulo: 'Variables Socioeconómicas y Geográficas de Mayor Incidencia',
        fuente_institucional: 'INEGI / Salud EDOMEX',
        categoria: 'Análisis Territorial',
        resumen: 'En municipios con localidades dispersas y contrastes socioeconómicos como Villa Victoria, las brechas de distancia a clínicas y el acceso desigual a orientación preventiva influyen en el riesgo de embarazo adolescente.',
        url_oficial: 'https://www.inegi.org.mx/'
    },
    {
        titulo: 'Impacto del Embarazo Temprano en Metas Personales y Profesionales',
        fuente_institucional: 'IMSS Bienestar / CECyTEM',
        categoria: 'Proyecto de Vida',
        resumen: 'Un embarazo en la adolescencia puede interrumpir o retrasar la trayectoria escolar, dificultar la inserción laboral formal y modificar los planes académicos y profesionales a mediano y largo plazo.',
        url_oficial: 'https://cecytem.edomex.gob.mx/'
    },
    {
        titulo: 'Bienestar Socioemocional y Redes de Apoyo Juvenil',
        fuente_institucional: 'IMSS Bienestar Villa Victoria',
        categoria: 'Salud Socioemocional',
        resumen: 'Contar con acompañamiento emocional, diálogo respetuoso y orientación médica confiable ayuda a reducir el estrés, prevenir situaciones de vulnerabilidad y tomar decisiones informadas sobre el cuidado personal.',
        url_oficial: 'https://imssbienestar.gob.mx/'
    },
    {
        titulo: 'Consentimiento Informado y Relaciones Saludables',
        fuente_institucional: 'Derechos Humanos / Sector Salud',
        categoria: 'Relaciones y Consentimiento',
        resumen: 'Toda relación afectiva y sexual debe sustentarse en el respeto mutuo, la autonomía corporal y el consentimiento libre, claro, informado y revocable en cualquier momento, sin presiones ni violencia.',
        url_oficial: 'https://www.gob.mx/salud%7Ccnegssr/articulos/servicios-amigables'
    },
    {
        titulo: 'Servicios Amigables y Métodos Anticonceptivos Gratuitos',
        fuente_institucional: 'IMSS Bienestar / Secretaría de Salud EDOMEX',
        categoria: 'Prevención y Anticoncepción',
        resumen: 'Las unidades de salud y servicios amigables brindan consejería y métodos anticonceptivos —incluyendo condones y opciones de planificación familiar— para prevenir embarazos no planeados y respaldar decisiones informadas.',
        url_oficial: 'https://salud.edomex.gob.mx/isem/'
    },
    {
        titulo: 'Prevención, Confidencialidad y Detección Oportuna de ITS',
        fuente_institucional: 'NOM-047-SSA2-2015 / Sector Salud',
        categoria: 'Prevención de ITS',
        resumen: 'El uso constante del condón en prácticas sexuales y la realización de pruebas médicas cuando existe duda o exposición permiten detectar infecciones de transmisión sexual a tiempo y recibir atención oportuna.',
        url_oficial: 'https://www.gob.mx/cms/uploads/attachment/file/53624/NOM-047-SSA2-2015.pdf'
    }
];

function renderizarTarjetasNormativa(items) {
    const contenedor = document.getElementById('contenedorNormativa');
    if (!contenedor) return;

    contenedor.innerHTML = items.map(item => {
        const enlace = item.url_oficial || 'https://www.gob.mx/salud/documentos/nom-047-ssa2-2015-para-la-atencion-a-la-salud-del-grupo-etario-de-10-a-19-anos-de-edad';
        return `
            <div class="col-12 col-md-6">
                <div class="clinic-detailed-card h-100 d-flex flex-column">
                    <h4>${item.titulo}</h4>
                    <div class="my-2"><span class="tag">${item.fuente_institucional}</span> <span class="tag">${item.categoria}</span></div>
                    <p class="text-muted small flex-grow-1">${item.resumen}</p>
                    <a href="${enlace}" target="_blank" rel="noopener noreferrer" class="normativa-link">🔗 Consultar fuente oficial ↗</a>
                </div>
            </div>
        `;
    }).join('');
}

async function cargarNormativaDesdeSupabase() {
    const contenedor = document.getElementById('contenedorNormativa');
    if (!contenedor) return;

    const { data, error } = await supabase
        .from('contenidos_normativos')
        .select('*')
        .order('actualizado_en', { ascending: false });

    if (!error && data && data.length > 0) {
        const combinadas = [...data, ...normativaRespaldo];
        renderizarTarjetasNormativa(combinadas);
    } else {
        renderizarTarjetasNormativa(normativaRespaldo);
    }
}

const mitosRespaldo = [
    {
        id: null,
        enunciado: "1. ¿La primera vez no hay riesgo de embarazo?",
        respuestaCorrecta: false,
        explicacion: "Existe riesgo de embarazo e ITS desde la primera relación sexual si no se usa protección adecuada."
    },
    {
        id: null,
        enunciado: "2. ¿El condón es el único método que previene Infecciones de Transmisión Sexual (ITS)?",
        respuestaCorrecta: true,
        explicacion: "Los métodos hormonales y el DIU previenen embarazos, pero solo el condón protege contra ITS."
    },
    {
        id: null,
        enunciado: "3. ¿Usar dos condones al mismo tiempo ofrece doble protección?",
        respuestaCorrecta: false,
        explicacion: "La fricción entre dos preservativos aumenta el riesgo de que se rompan. Usa solo uno por relación."
    },
    {
        id: null,
        enunciado: "4. ¿El uso de métodos anticonceptivos hormonales causa infertilidad permanente?",
        respuestaCorrecta: false,
        explicacion: "La fertilidad regresa tras suspender el método hormonal; no provocan esterilidad permanente."
    },
    {
        id: null,
        enunciado: "5. ¿Las y los adolescentes pueden solicitar métodos anticonceptivos y orientación de forma confidencial?",
        respuestaCorrecta: true,
        explicacion: "La atención en salud sexual para adolescentes es gratuita y confidencial conforme a la NOM-047-SSA2-2015."
    },
    {
        id: null,
        enunciado: "6. ¿Una persona con una ITS siempre presenta síntomas visibles de inmediato?",
        respuestaCorrecta: false,
        explicacion: "Muchas ITS (como clamidia, gonorrea, VPH o VIH) pueden no dar síntomas visibles al principio."
    },
    {
        id: null,
        enunciado: "7. ¿Lavarse después de tener relaciones sexuales evita un embarazo?",
        respuestaCorrecta: false,
        explicacion: "El lavado o ducha vaginal posterior no impide que los espermatozoides lleguen ni previene ITS."
    },
    {
        id: null,
        enunciado: "8. ¿La Pastilla Anticonceptiva de Emergencia (PAE) es un método anticonceptivo de uso regular?",
        respuestaCorrecta: false,
        explicacion: "La PAE es solo para emergencias; no reemplaza a un método anticonceptivo regular."
    }
];

let listaMitos = [...mitosRespaldo];
let mitoActualIndex = 0;
let aciertosMitos = 0;
let respuestasMitosTemp = [];

function limpiarEstadoOpcionesMito() {
    const btnV = document.getElementById('btnMitoVerdadero');
    const btnF = document.getElementById('btnMitoFalso');
    [btnV, btnF].forEach(btn => {
        if (!btn) return;
        btn.disabled = false;
        btn.classList.remove('opcion-correcta', 'opcion-incorrecta');
    });

    const fb = document.getElementById('feedbackBoxMito');
    if (fb) {
        fb.classList.add('hidden');
        fb.classList.remove('feedback-correcta', 'feedback-incorrecta');
    }
}

async function cargarMitosDesdeSupabase() {
    const { data } = await supabase
        .from('preguntas_evaluacion')
        .select('id, enunciado')
        .eq('tipo_modulo', 'mitos_realidades')
        .order('id', { ascending: true });

    listaMitos = mitosRespaldo.map((item, i) => ({
        ...item,
        id: data && data[i] ? data[i].id : null
    }));

    mitoActualIndex = Math.min(mitoActualIndex, Math.max(listaMitos.length - 1, 0));
    cargarMitoActual();
}

function cargarMitoActual() {
    const mito = listaMitos[mitoActualIndex];
    if (!mito) return;

    document.getElementById('mitoEnunciado').innerText = mito.enunciado;
    limpiarEstadoOpcionesMito();
    document.getElementById('feedbackTextMito').innerText = '';
    document.getElementById('btnSiguienteMito')?.classList.add('hidden');

    const total = listaMitos.length;
    const porcentajeBarra = Math.round((mitoActualIndex / total) * 100);
    document.getElementById('progressFillMito').style.width = `${porcentajeBarra}%`;
    document.getElementById('progressTextMito').innerText = `Mito ${mitoActualIndex + 1} de ${total}`;
}

function responderMito(respuestaUsuario) {
    const mito = listaMitos[mitoActualIndex];
    if (!mito) return;

    const esCorrecta = respuestaUsuario === mito.respuestaCorrecta;
    if (esCorrecta) aciertosMitos++;

    const btnV = document.getElementById('btnMitoVerdadero');
    const btnF = document.getElementById('btnMitoFalso');
    if (btnV) btnV.disabled = true;
    if (btnF) btnF.disabled = true;

    const btnElegido = respuestaUsuario ? btnV : btnF;
    const btnCorrecto = mito.respuestaCorrecta ? btnV : btnF;

    if (esCorrecta) {
        btnElegido?.classList.add('opcion-correcta');
    } else {
        btnElegido?.classList.add('opcion-incorrecta');
        btnCorrecto?.classList.add('opcion-correcta');
    }

    const feedbackBox = document.getElementById('feedbackBoxMito');
    const feedbackText = document.getElementById('feedbackTextMito');
    if (feedbackText) {
        feedbackText.innerHTML = (esCorrecta ? '<strong>¡Correcto!</strong> ' : '<strong>Incorrecto.</strong> ') + mito.explicacion;
    }
    if (feedbackBox) {
        feedbackBox.classList.remove('hidden', 'feedback-correcta', 'feedback-incorrecta');
        feedbackBox.classList.add(esCorrecta ? 'feedback-correcta' : 'feedback-incorrecta');
    }
    document.getElementById('btnSiguienteMito')?.classList.remove('hidden');

    if (mito.id) {
        respuestasMitosTemp.push({
            pregunta_id: mito.id,
            respuesta_elegida: respuestaUsuario ? 'Verdadero' : 'Falso',
            es_correcta: esCorrecta
        });
    }
}

async function siguienteMito() {
    mitoActualIndex++;
    if (mitoActualIndex < listaMitos.length) {
        cargarMitoActual();
    } else {
        document.getElementById('progressFillMito').style.width = '100%';
        document.getElementById('progressTextMito').innerText = `Completado (${listaMitos.length} de ${listaMitos.length})`;
        await guardarEvaluacionEnSupabase('mitos_realidades', aciertosMitos, listaMitos.length, respuestasMitosTemp);
        await cargarHistorialEvaluacionesEnTablas();

        document.getElementById('mitoCard').innerHTML = `
            <div style="text-align: center; padding: 1rem;">
                <h3 style="color: #7dd3fc;">🎉 ¡Completaste Mitos y Realidades!</h3>
                <p class="text-muted" style="margin: 10px 0 16px 0;">Obtuviste ${aciertosMitos} de ${listaMitos.length} aciertos.</p>
                <button type="button" class="btn-primary" onclick="reiniciarMitos()">🔄 Volver a Empezar</button>
            </div>
        `;
        document.getElementById('feedbackBoxMito')?.classList.add('hidden');
        document.getElementById('btnSiguienteMito')?.classList.add('hidden');
    }
}

function reiniciarMitos() {
    mitoActualIndex = 0;
    aciertosMitos = 0;
    respuestasMitosTemp = [];
    document.getElementById('mitoCard').innerHTML = `
        <h3 id="mitoEnunciado">Cargando mito...</h3>
        <div class="test-options" id="mitoOptionsContainer">
            <button type="button" onclick="responderMito(true)" id="btnMitoVerdadero" class="btn-option">✅ Verdadero / Realidad</button>
            <button type="button" onclick="responderMito(false)" id="btnMitoFalso" class="btn-option">❌ Falso / Mito</button>
        </div>
    `;
    cargarMitoActual();
}

const testRespaldo = [
    {
        id: null,
        pregunta: "1. ¿Cuál es el único método anticonceptivo que protege contra embarazos e ITS?",
        opciones: ["A) Parche anticonceptivo", "B) Condón masculino o femenino", "C) Pastilla del día siguiente", "D) DIU de cobre"],
        correcta: 1,
        explicacion: "El condón es el único método de barrera que impide el intercambio de fluidos, previniendo infecciones y embarazos."
    },
    {
        id: null,
        pregunta: "2. ¿Dentro de cuántas horas es más efectiva la Pastilla Anticonceptiva de Emergencia (PAE)?",
        opciones: ["A) Dentro de las primeras 72 horas", "B) Hasta 2 semanas después", "C) Solo el primer mes", "D) No tiene límite"],
        correcta: 0,
        explicacion: "La PAE tiene mayor eficacia si se toma dentro de las primeras 72 horas tras la relación sin protección."
    },
    {
        id: null,
        pregunta: "3. En los centros de salud públicos de Villa Victoria, los preservativos son:",
        opciones: ["A) Solo para adultos con costo", "B) Gratuitos y confidenciales para jóvenes", "C) Solo bajo receta médica", "D) No se entregan en clínicas"],
        correcta: 1,
        explicacion: "Los insumos de protección son gratuitos y confidenciales para cualquier joven en clínicas públicas."
    },
    {
        id: null,
        pregunta: "4. ¿Qué significa el consentimiento en las relaciones sexuales?",
        opciones: ["A) Que una persona guarde silencio", "B) Un acuerdo libre, informado, entusiasta y revocable", "C) Que ya hubo una cita previa", "D) Que solo lo decide una parte"],
        correcta: 1,
        explicacion: "El consentimiento debe ser libre, claro, sin presión y puede retirarse en cualquier momento."
    },
    {
        id: null,
        pregunta: "5. ¿Cuál es un método anticonceptivo de larga duración reversible (LARC)?",
        opciones: ["A) Coito interrumpido", "B) Implante subdérmico o DIU", "C) Ducha vaginal", "D) Calendario sin registro"],
        correcta: 1,
        explicacion: "El implante subdérmico y el DIU ofrecen protección prolongada y son reversibles al retirarlos."
    },
    {
        id: null,
        pregunta: "6. ¿Por qué es importante realizarse pruebas de detección de ITS?",
        opciones: ["A) Porque muchas ITS son asintomáticas al inicio", "B) Porque sustituyen al uso del condón", "C) Porque solo afectan a mayores de 50 años", "D) Porque evitan cualquier revisión médica futura"],
        correcta: 0,
        explicacion: "Detectar a tiempo permite iniciar tratamiento oportuno y cuidar la salud propia y de la pareja."
    },
    {
        id: null,
        pregunta: "7. ¿Cuál es el número de la Línea de la Vida para orientación gratuita en México?",
        opciones: ["A) 800 911 2000", "B) 066 123 4567", "C) 800 000 1111", "D) 911 800 5000"],
        correcta: 0,
        explicacion: "La Línea de la Vida (800 911 2000) brinda orientación y apoyo gratuito a nivel nacional."
    },
    {
        id: null,
        pregunta: "8. ¿Qué se debe hacer antes de usar un condón?",
        opciones: ["A) Revisar la fecha de caducidad y que el empaque tenga aire", "B) Abrir el empaque con tijeras o dientes", "C) Lavarlo con jabón antes de abrirlo", "D) Colocarlo después de eyacular"],
        correcta: 0,
        explicacion: "Verificar la caducidad y la integridad del empaque, y abrirlo con los dedos, evita daños al látex."
    }
];

let listaTest = [...testRespaldo];
let testActualIndex = 0;
let aciertosTest = 0;
let respuestasTestTemp = [];

async function cargarTestDesdeSupabase() {
    const { data } = await supabase
        .from('preguntas_evaluacion')
        .select('id, enunciado')
        .eq('tipo_modulo', 'test_educativo')
        .order('id', { ascending: true });

    listaTest = testRespaldo.map((item, i) => ({
        ...item,
        id: data && data[i] ? data[i].id : null
    }));

    testActualIndex = Math.min(testActualIndex, Math.max(listaTest.length - 1, 0));
    cargarPreguntaTestActual();
}

function cargarPreguntaTestActual() {
    const q = listaTest[testActualIndex];
    if (!q) return;

    document.getElementById('testEnunciado').innerText = q.pregunta;
    const fb = document.getElementById('feedbackBoxTest');
    if (fb) {
        fb.classList.add('hidden');
        fb.classList.remove('feedback-correcta', 'feedback-incorrecta');
    }
    document.getElementById('feedbackTextTest').innerText = '';
    document.getElementById('btnSiguienteTest')?.classList.add('hidden');

    const container = document.getElementById('testOptionsContainer');
    container.innerHTML = '';
    q.opciones.forEach((opcion, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-option';
        btn.innerText = opcion;
        btn.onclick = () => responderTest(idx);
        container.appendChild(btn);
    });

    const total = listaTest.length;
    const porcentajeBarra = Math.round((testActualIndex / total) * 100);
    document.getElementById('progressFillTest').style.width = `${porcentajeBarra}%`;
    document.getElementById('progressTextTest').innerText = `Pregunta ${testActualIndex + 1} de ${total}`;
}

function responderTest(opcionSeleccionada) {
    const q = listaTest[testActualIndex];
    if (!q) return;

    const esCorrecta = opcionSeleccionada === q.correcta;
    if (esCorrecta) aciertosTest++;

    const botones = Array.from(document.querySelectorAll('#testOptionsContainer button'));
    botones.forEach(b => b.disabled = true);

    if (esCorrecta) {
        botones[opcionSeleccionada]?.classList.add('opcion-correcta');
    } else {
        botones[opcionSeleccionada]?.classList.add('opcion-incorrecta');
        botones[q.correcta]?.classList.add('opcion-correcta');
    }

    const feedbackBox = document.getElementById('feedbackBoxTest');
    const feedbackText = document.getElementById('feedbackTextTest');
    if (feedbackText) {
        feedbackText.innerHTML = (esCorrecta ? '<strong>¡Correcto!</strong> ' : '<strong>Incorrecto.</strong> ') + q.explicacion;
    }
    if (feedbackBox) {
        feedbackBox.classList.remove('hidden', 'feedback-correcta', 'feedback-incorrecta');
        feedbackBox.classList.add(esCorrecta ? 'feedback-correcta' : 'feedback-incorrecta');
    }
    document.getElementById('btnSiguienteTest')?.classList.remove('hidden');

    if (q.id) {
        respuestasTestTemp.push({
            pregunta_id: q.id,
            respuesta_elegida: q.opciones[opcionSeleccionada] || '',
            es_correcta: esCorrecta
        });
    }
}

async function siguientePreguntaTest() {
    testActualIndex++;
    if (testActualIndex < listaTest.length) {
        cargarPreguntaTestActual();
    } else {
        document.getElementById('progressFillTest').style.width = '100%';
        document.getElementById('progressTextTest').innerText = `Completado (${listaTest.length} de ${listaTest.length})`;
        await guardarEvaluacionEnSupabase('test_educativo', aciertosTest, listaTest.length, respuestasTestTemp);
        await cargarHistorialEvaluacionesEnTablas();

        document.getElementById('testCard').innerHTML = `
            <div style="text-align: center; padding: 1rem;">
                <h3 style="color: #7dd3fc;">🎉 ¡Completaste el Test Educativo!</h3>
                <p class="text-muted" style="margin: 10px 0 16px 0;">Obtuviste ${aciertosTest} de ${listaTest.length} respuestas correctas.</p>
                <button type="button" class="btn-primary" onclick="reiniciarTest()">🔄 Volver a Intentar</button>
            </div>
        `;
        document.getElementById('feedbackBoxTest')?.classList.add('hidden');
        document.getElementById('btnSiguienteTest')?.classList.add('hidden');
    }
}

function reiniciarTest() {
    testActualIndex = 0;
    aciertosTest = 0;
    respuestasTestTemp = [];
    document.getElementById('testCard').innerHTML = `
        <h3 id="testEnunciado">Cargando pregunta...</h3>
        <div class="test-options" id="testOptionsContainer"></div>
    `;
    cargarPreguntaTestActual();
}

const preguntasImpacto = [
    {
        enunciado: "1. ¿Qué factores suelen incidir con mayor frecuencia en la vulnerabilidad frente al embarazo adolescente en municipios con zonas rurales como Villa Victoria?",
        opciones: [
            "A) La distancia a centros de salud, limitaciones económicas, rezago educativo y falta de orientación oportuna",
            "B) Únicamente el clima frío de la región",
            "C) El uso de bibliotecas escolares"
        ],
        correcta: 0,
        explicacion: "Las variables geográficas (dispersión comunitaria y traslado), socioeconómicas y educativas influyen directamente en el acceso a información y servicios preventivos."
    },
    {
        enunciado: "2. ¿Cuál es uno de los principales impactos del embarazo temprano en las y los jóvenes?",
        opciones: [
            "A) Garantiza la conclusión inmediata de estudios universitarios sin apoyos",
            "B) Puede dificultar la continuidad escolar, limitar oportunidades laborales y aumentar la carga socioemocional",
            "C) Elimina la necesidad de atención médica preventiva"
        ],
        correcta: 1,
        explicacion: "El embarazo adolescente puede afectar metas académicas, inserción laboral y bienestar emocional, por lo que la prevención y el acompañamiento son clave."
    },
    {
        enunciado: "3. ¿Qué instituciones y marcos de apoyo fortalecen la orientación y atención juvenil en Villa Victoria y el Estado de México?",
        opciones: [
            "A) IMSS Bienestar, Secretaría de Salud del EDOMEX, datos del INEGI y normatividad como la NOM-047-SSA2-2015",
            "B) Tiendas departamentales sin servicios médicos",
            "C) Agencias de turismo sin personal de salud"
        ],
        correcta: 0,
        explicacion: "La coordinación institucional y la normativa vigente respaldan la atención médica, consejería y acceso gratuito a métodos preventivos."
    },
    {
        enunciado: "4. ¿Por qué es importante analizar datos estadísticos e impacto social en una plataforma comunitaria como EducSex?",
        opciones: [
            "A) Para identificar necesidades reales de los jóvenes y orientar mejor la prevención y redes de apoyo locales",
            "B) Para publicar datos personales de los alumnos",
            "C) Para sustituir la consulta médica profesional"
        ],
        correcta: 0,
        explicacion: "Comprender el contexto local ayuda a enfocar la prevención, ubicar centros de salud cercanos y tomar decisiones informadas."
    }
];

let indiceImpacto = 0;
let aciertosImpacto = 0;
let respondidaImpacto = false;

function iniciarImpactoQuiz() {
    indiceImpacto = 0;
    aciertosImpacto = 0;
    respondidaImpacto = false;
    document.getElementById("contenedorImpactoQuiz")?.classList.remove("hidden");
    document.getElementById("feedbackImpactoBox")?.classList.add("hidden");
    document.getElementById("resultadoImpactoFinal")?.classList.add("hidden");
    renderPreguntaImpacto();
}

function renderPreguntaImpacto() {
    const actual = preguntasImpacto[indiceImpacto];
    const enunciadoEl = document.getElementById("preguntaImpactoEnunciado");
    const progresoEl = document.getElementById("progresoImpactoTexto");
    const barraEl = document.getElementById("progressFillImpacto");
    const contenedorOpciones = document.getElementById("opcionesImpactoContainer");
    const feedbackBox = document.getElementById("feedbackImpactoBox");

    if (!actual || !enunciadoEl || !contenedorOpciones) return;

    respondidaImpacto = false;
    feedbackBox?.classList.add("hidden");
    feedbackBox?.classList.remove("feedback-correcta", "feedback-incorrecta");

    const porcentajeBarra = Math.round((indiceImpacto / preguntasImpacto.length) * 100);
    if (barraEl) barraEl.style.width = `${porcentajeBarra}%`;
    if (progresoEl) progresoEl.textContent = `Pregunta ${indiceImpacto + 1} de ${preguntasImpacto.length}`;

    enunciadoEl.textContent = actual.enunciado;
    contenedorOpciones.innerHTML = "";

    actual.opciones.forEach((textoOpcion, idx) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn-option";
        btn.textContent = textoOpcion;
        btn.onclick = () => evaluarOpcionImpacto(idx, btn);
        contenedorOpciones.appendChild(btn);
    });
}

function evaluarOpcionImpacto(seleccion, botonClickeado) {
    if (respondidaImpacto) return;
    respondidaImpacto = true;

    const actual = preguntasImpacto[indiceImpacto];
    const botones = document.querySelectorAll("#opcionesImpactoContainer .btn-option");
    const feedbackBox = document.getElementById("feedbackImpactoBox");
    const feedbackTexto = document.getElementById("feedbackImpactoTexto");

    botones.forEach((btn, i) => {
        btn.disabled = true;
        if (i === actual.correcta) {
            btn.classList.add("opcion-correcta");
        }
    });

    const esCorrecta = seleccion === actual.correcta;
    if (esCorrecta) {
        aciertosImpacto++;
    } else {
        botonClickeado.classList.add("opcion-incorrecta");
    }

    if (feedbackBox && feedbackTexto) {
        feedbackBox.classList.remove("hidden", "feedback-correcta", "feedback-incorrecta");
        feedbackBox.classList.add(esCorrecta ? "feedback-correcta" : "feedback-incorrecta");
        feedbackTexto.innerHTML = `${esCorrecta ? "<strong>¡Correcto!</strong> " : "<strong>Incorrecto.</strong> "}${actual.explicacion}`;
    }
}

async function siguientePreguntaImpacto() {
    indiceImpacto++;
    if (indiceImpacto < preguntasImpacto.length) {
        renderPreguntaImpacto();
    } else {
        const barraEl = document.getElementById("progressFillImpacto");
        const progresoEl = document.getElementById("progresoImpactoTexto");
        if (barraEl) barraEl.style.width = "100%";
        if (progresoEl) progresoEl.textContent = `Completado (${preguntasImpacto.length} de ${preguntasImpacto.length})`;

        await guardarEvaluacionEnSupabase("estadistica_impacto", aciertosImpacto, preguntasImpacto.length, []);
        await cargarHistorialEvaluacionesEnTablas();

        document.getElementById("contenedorImpactoQuiz")?.classList.add("hidden");
        document.getElementById("feedbackImpactoBox")?.classList.add("hidden");

        const resultadoBox = document.getElementById("resultadoImpactoFinal");
        const tituloEl = document.getElementById("tituloResultadoImpacto");
        const detalleEl = document.getElementById("detalleResultadoImpacto");
        const porcentaje = Math.round((aciertosImpacto / preguntasImpacto.length) * 100);

        if (resultadoBox && tituloEl && detalleEl) {
            resultadoBox.classList.remove("hidden");
            tituloEl.textContent = `🎉 Resultado del Módulo: ${aciertosImpacto} de ${preguntasImpacto.length} (${porcentaje}%)`;
            detalleEl.textContent = porcentaje >= 75
                ? "Excelente comprensión sobre los factores de riesgo, el impacto socioemocional y las redes de apoyo en Villa Victoria."
                : "Buen intento. Revisa las tarjetas de contexto y las fuentes institucionales para reforzar estos conceptos.";
        }
    }
}

function reiniciarImpactoQuiz() {
    iniciarImpactoQuiz();
}

async function guardarEvaluacionEnSupabase(modulo, puntaje, total, detallesRespuestas) {
    const porcentaje = total > 0 ? Number(((puntaje / total) * 100).toFixed(2)) : 0;
    const nombreModulo = modulo === 'mitos_realidades'
        ? 'Mitos y Realidades'
        : modulo === 'estadistica_impacto'
            ? 'Estadística e Impacto'
            : 'Test Educativo';

    await registrarMovimientoUsuario(
        nombreModulo,
        'Completó evaluación',
        `Aciertos: ${puntaje}/${total} (${porcentaje}%)`
    );

    const permitirGuardar = document.getElementById('chkGuardarHistorial')?.checked ?? true;
    if (!usuarioActual || !permitirGuardar) return;

    const { data: evalInsertada, error } = await supabase
        .from('evaluaciones')
        .insert({
            usuario_id: usuarioActual.id,
            modulo,
            puntaje_obtenido: puntaje,
            total_reactivos: total,
            porcentaje
        })
        .select()
        .single();

    if (!error && evalInsertada && detallesRespuestas.length > 0) {
        evaluacionActivaId = evalInsertada.id;
        const filas = detallesRespuestas.map(r => ({
            evaluacion_id: evaluacionActivaId,
            pregunta_id: r.pregunta_id,
            respuesta_elegida: r.respuesta_elegida,
            es_correcta: r.es_correcta
        }));
        await supabase.from('respuestas_evaluacion').insert(filas);
    }
}

async function cargarHistorialEvaluacionesEnTablas() {
    if (!usuarioActual) return;

    const { data: historial } = await supabase
        .from('evaluaciones')
        .select('*')
        .eq('usuario_id', usuarioActual.id)
        .order('fecha_realizacion', { ascending: false });

    const total = historial?.length || 0;
    const promedio = total > 0
        ? (historial.reduce((acc, item) => acc + Number(item.porcentaje || 0), 0) / total).toFixed(1)
        : 0;

    const resumenHTML = `
        <p>Evaluaciones realizadas: <strong>${total}</strong></p>
        <p>Puntaje promedio: <strong>${promedio}%</strong></p>
    `;

    const filasHTML = total > 0
        ? historial.map(ev => {
            const fecha = new Date(ev.fecha_realizacion).toLocaleDateString('es-MX');
            const nombreMod = ev.modulo === 'mitos_realidades'
                ? 'Mitos'
                : ev.modulo === 'estadistica_impacto'
                    ? 'Impacto'
                    : 'Test';
            return `<tr><td>${nombreMod}</td><td>${fecha}</td><td><strong>${ev.porcentaje}%</strong></td></tr>`;
        }).join('')
        : '<tr><td colspan="3" class="text-muted">Sin registros aún</td></tr>';

    ['Mitos', 'Test', 'Impacto'].forEach(sufijo => {
        const resEl = document.getElementById('resumenProgreso' + sufijo);
        const tabEl = document.getElementById('tablaHistorial' + sufijo);
        if (resEl) resEl.innerHTML = resumenHTML;
        if (tabEl) tabEl.innerHTML = filasHTML;
    });
}

function actualizarEtiquetaSwitchRol() {
    const esAdminSwitch = document.getElementById('switchRolAdmin')?.checked;
    document.getElementById('lblRolUsuario')?.classList.toggle('active-role', !esAdminSwitch);
    document.getElementById('lblRolAdmin')?.classList.toggle('active-role', esAdminSwitch);
}

function establecerModoAuth(esRegistro) {
    modoRegistro = Boolean(esRegistro);
    document.getElementById('authFormTitulo').innerText = modoRegistro ? 'Crear Cuenta' : 'Iniciar Sesión';
    document.getElementById('btnSubmitAuth').innerText = modoRegistro ? 'Registrarme' : 'Ingresar';
    document.getElementById('textoAlternarAuth').innerText = modoRegistro ? '¿Ya tienes cuenta?' : '¿No tienes cuenta?';
    document.getElementById('btnAlternarRegistro').innerHTML = modoRegistro ? '<strong>Iniciar sesión</strong>' : '<strong>Crear cuenta</strong>';
    document.getElementById('lblNombreOpcional').classList.toggle('hidden', !modoRegistro);
    document.getElementById('campoGrupoRegistro').classList.toggle('hidden', !modoRegistro);
}

function alternarModoRegistro() {
    establecerModoAuth(!modoRegistro);
}

async function abrirLoginDesdeBienvenida(modo) {
    establecerModoAuth(modo === 'registro');
    await mostrarPantalla('login');
}

document.getElementById('formAuth')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('authCorreo').value.trim();
    const password = document.getElementById('authPassword').value;
    const rolSeleccionado = document.getElementById('switchRolAdmin')?.checked ? 1 : 2;

    if (modoRegistro) {
        const nombre_completo = document.getElementById('authNombre').value.trim() || 'Usuario EducSex';
        const edad_o_grupo = document.getElementById('authGrupo').value.trim() || null;

        const { error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: { nombre_completo, edad_o_grupo, rol_id: rolSeleccionado }
            }
        });

        if (error) {
            alert('Error al crear cuenta: ' + error.message);
            return;
        }
        alert('Cuenta creada correctamente. Ahora pulsa Ingresar para entrar con tu correo y contraseña.');
        establecerModoAuth(false);
    } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
            alert('Error al iniciar sesión: ' + error.message);
            return;
        }
        await cargarSesionUsuario(data.user);
        await registrarMovimientoUsuario('Autenticación', 'Inicio de sesión', `Acceso exitoso: ${email}`);
        const esAdmin = perfilActual?.rol_id === 1 || perfilActual?.roles?.nombre_rol === 'Administrador';
        await mostrarPantalla(esAdmin ? 'admin' : 'home');
    }
});

async function cerrarSesion() {
    await registrarMovimientoUsuario('Autenticación', 'Cierre de sesión', 'El usuario cerró sesión manualmente');
    await supabase.auth.signOut();
    usuarioActual = null;
    perfilActual = null;
    document.getElementById('menuDesplegablePerfil')?.classList.add('hidden');
    actualizarVisibilidadNavegacion();
    await mostrarPantalla('bienvenida');
}

async function cargarSesionUsuario(user) {
    if (!user) return;
    usuarioActual = user;

    const { data: perfil } = await supabase
        .from('perfiles')
        .select('*, roles(nombre_rol)')
        .eq('id', user.id)
        .single();

    perfilActual = perfil;
    const primerNombre = perfil?.nombre_completo ? perfil.nombre_completo.split(' ')[0] : 'Perfil';
    document.getElementById('navNombreUsuario').innerText = primerNombre;
    actualizarVisibilidadNavegacion();
}

async function cargarDatosEnFormularioPerfil() {
    if (!usuarioActual) return;
    document.getElementById('perfilEditNombre').value = perfilActual?.nombre_completo || '';
    document.getElementById('perfilEditCorreo').value = perfilActual?.correo || usuarioActual.email;
    document.getElementById('perfilEditGrupo').value = perfilActual?.edad_o_grupo || '';
    document.getElementById('perfilRolTexto').innerText = `Rol: ${perfilActual?.roles?.nombre_rol || 'Usuario'}`;
}

function cambiarAvatarIcono() {
    avatarIdx = (avatarIdx + 1) % avataresDisponibles.length;
    document.getElementById('perfilAvatarCirculo').innerText = avataresDisponibles[avatarIdx];
    registrarMovimientoUsuario('Perfil', 'Cambió avatar', `Avatar seleccionado: ${avataresDisponibles[avatarIdx]}`);
}

document.getElementById('formEditarPerfil')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!usuarioActual) return;

    const nombre_completo = document.getElementById('perfilEditNombre').value.trim();
    const edad_o_grupo = document.getElementById('perfilEditGrupo').value.trim() || null;
    const nuevaPassword = document.getElementById('perfilEditPassword').value.trim();

    const { error } = await supabase
        .from('perfiles')
        .update({ nombre_completo, edad_o_grupo })
        .eq('id', usuarioActual.id);

    if (error) {
        alert('Error al actualizar perfil: ' + error.message);
        return;
    }

    if (nuevaPassword.length >= 6) {
        await supabase.auth.updateUser({ password: nuevaPassword });
        document.getElementById('perfilEditPassword').value = '';
    }

    await cargarSesionUsuario(usuarioActual);
    await registrarMovimientoUsuario('Perfil', 'Actualizó datos personales', `Nombre: ${nombre_completo} | Grupo: ${edad_o_grupo || 'N/A'}`);
    alert('Cambios guardados correctamente.');
});

function toggleFormNuevoCentro() {
    document.getElementById('formAdminCentro')?.classList.toggle('hidden');
}

function filtrarTablaAdminCentros() {
    const filtro = document.getElementById('adminBuscarCentro')?.value.toLowerCase() || '';
    document.querySelectorAll('#tablaAdminCentrosBody tr').forEach(fila => {
        fila.style.display = fila.innerText.toLowerCase().includes(filtro) ? '' : 'none';
    });
}

function filtrarTablaAdminUsuarios() {
    const filtro = document.getElementById('adminBuscarUsuario')?.value.toLowerCase() || '';
    document.querySelectorAll('#tablaAdminUsuariosBody tr').forEach(fila => {
        fila.style.display = fila.innerText.toLowerCase().includes(filtro) ? '' : 'none';
    });
}

function renderizarTablaLogsAdmin(listaLogs) {
    const tbodyLogs = document.getElementById('tablaAdminLogsBody');
    if (!tbodyLogs) return;

    if (!listaLogs || listaLogs.length === 0) {
        tbodyLogs.innerHTML = '<tr><td colspan="6" class="text-muted">No hay movimientos registrados aún.</td></tr>';
        return;
    }

    tbodyLogs.innerHTML = listaLogs.map(log => {
        const fecha = new Date(log.fecha_evento).toLocaleString('es-MX', {
            dateStyle: 'short',
            timeStyle: 'medium'
        });
        const esRolAdmin = (log.rol_nombre || '').toLowerCase().includes('admin');
        return `
            <tr>
                <td><span class="log-detail-code">${fecha}</span></td>
                <td><strong>${log.usuario_nombre}</strong><br><span class="text-muted small">${log.usuario_correo}</span></td>
                <td><span class="log-badge ${esRolAdmin ? 'admin-role' : ''}">${log.rol_nombre}</span></td>
                <td>${log.modulo}</td>
                <td><strong>${log.accion}</strong></td>
                <td><span class="log-detail-code">${log.detalle || '—'}</span></td>
            </tr>
        `;
    }).join('');
}

function filtrarLogsAdmin() {
    const mod = document.getElementById('adminFiltroModulo')?.value.toLowerCase() || '';
    const texto = document.getElementById('adminBuscarLog')?.value.toLowerCase() || '';

    const filtrados = logsAuditoriaCache.filter(item => {
        const coincideMod = !mod || (item.modulo || '').toLowerCase() === mod;
        const cadena = `${item.usuario_nombre} ${item.usuario_correo} ${item.rol_nombre} ${item.modulo} ${item.accion} ${item.detalle}`.toLowerCase();
        const coincideTexto = !texto || cadena.includes(texto);
        return coincideMod && coincideTexto;
    });

    renderizarTablaLogsAdmin(filtrados);
}

function exportarLogsCSV() {
    if (!logsAuditoriaCache || logsAuditoriaCache.length === 0) {
        alert('No hay registros de auditoría para exportar.');
        return;
    }

    const encabezados = ['Fecha', 'Usuario', 'Correo', 'Rol', 'Modulo', 'Accion', 'Detalle'];
    const filas = logsAuditoriaCache.map(l => [
        `"${new Date(l.fecha_evento).toLocaleString('es-MX')}"`,
        `"${(l.usuario_nombre || '').replace(/"/g, '""')}"`,
        `"${(l.usuario_correo || '').replace(/"/g, '""')}"`,
        `"${(l.rol_nombre || '').replace(/"/g, '""')}"`,
        `"${(l.modulo || '').replace(/"/g, '""')}"`,
        `"${(l.accion || '').replace(/"/g, '""')}"`,
        `"${(l.detalle || '').replace(/"/g, '""')}"`
    ].join(','));

    const csv = [encabezados.join(','), ...filas].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = `auditoria_educsex_${new Date().toISOString().slice(0, 10)}.csv`;
    enlace.click();
    URL.revokeObjectURL(url);
}

async function cargarPanelAdmin() {
    const { data: perfilesLista, count: totalUsuarios } = await supabase
        .from('perfiles')
        .select('*, roles(nombre_rol)', { count: 'exact' })
        .order('nombre_completo', { ascending: true });

    document.getElementById('kpiTotalUsuarios').innerText = totalUsuarios || 0;

    const mapaNombresUsuarios = new Map();
    const tbodyUsuarios = document.getElementById('tablaAdminUsuariosBody');
    if (tbodyUsuarios) {
        if (perfilesLista && perfilesLista.length > 0) {
            perfilesLista.forEach(u => mapaNombresUsuarios.set(u.id, u.nombre_completo || u.correo));
            tbodyUsuarios.innerHTML = perfilesLista.map(u => {
                const rolTxt = u.roles?.nombre_rol || (u.rol_id === 1 ? 'Administrador' : 'Usuario General');
                return `
                    <tr>
                        <td><strong>${u.nombre_completo || 'Sin nombre'}</strong></td>
                        <td>${u.correo || '—'}</td>
                        <td>${u.edad_o_grupo || 'N/A'}</td>
                        <td><span class="log-badge ${rolTxt === 'Administrador' ? 'admin-role' : ''}">${rolTxt}</span></td>
                    </tr>
                `;
            }).join('');
        } else {
            tbodyUsuarios.innerHTML = '<tr><td colspan="4" class="text-muted">Sin usuarios registrados.</td></tr>';
        }
    }

    const { data: logsData } = await supabase
        .from('logs_actividad_sistema')
        .select('*')
        .order('fecha_evento', { ascending: false })
        .limit(150);

    logsAuditoriaCache = logsData || [];
    document.getElementById('kpiTotalEventos').innerText = logsAuditoriaCache.length;
    filtrarLogsAdmin();

    const { data: evalsData } = await supabase
        .from('evaluaciones')
        .select('*')
        .order('fecha_realizacion', { ascending: false })
        .limit(100);

    document.getElementById('kpiTotalEvaluaciones').innerText = evalsData?.length || 0;

    const tbodyEvals = document.getElementById('tablaAdminEvaluacionesBody');
    if (tbodyEvals) {
        if (evalsData && evalsData.length > 0) {
            tbodyEvals.innerHTML = evalsData.map(ev => {
                const nomUser = mapaNombresUsuarios.get(ev.usuario_id) || 'Usuario';
                const modTxt = ev.modulo === 'mitos_realidades'
                    ? 'Mitos'
                    : ev.modulo === 'estadistica_impacto'
                        ? 'Impacto'
                        : 'Test';
                const fecha = new Date(ev.fecha_realizacion).toLocaleDateString('es-MX');
                return `
                    <tr>
                        <td>${nomUser}</td>
                        <td>${modTxt}</td>
                        <td><strong>${ev.porcentaje}%</strong> (${ev.puntaje_obtenido}/${ev.total_reactivos})</td>
                        <td>${fecha}</td>
                    </tr>
                `;
            }).join('');
        } else {
            tbodyEvals.innerHTML = '<tr><td colspan="4" class="text-muted">Sin evaluaciones aún.</td></tr>';
        }
    }

    const { data: centros } = await supabase
        .from('centros_salud')
        .select('*')
        .order('id', { ascending: true });

    const tbody = document.getElementById('tablaAdminCentrosBody');
    if (tbody) {
        if (centros && centros.length > 0) {
            tbody.innerHTML = centros.map(c => `
                <tr>
                    <td><strong>${c.nombre}</strong></td>
                    <td>${c.direccion}</td>
                    <td>${c.servicios_jovenes || c.institucion}</td>
                    <td>
                        <button type="button" class="btn-secondary" style="padding: 4px 10px; font-size: 0.78rem; color: #f87171;" onclick="eliminarCentroAdmin(${c.id}, '${(c.nombre || '').replace(/'/g, '')}')">Eliminar</button>
                    </td>
                </tr>
            `).join('');
        } else {
            tbody.innerHTML = '<tr><td colspan="4" class="text-muted">No hay centros registrados aún.</td></tr>';
        }
    }

    const { data: stats } = await supabase
        .from('estadisticas_chat_anonimo')
        .select('*')
        .order('total_consultas', { ascending: false });

    const totalConsultasChat = (stats || []).reduce((acc, s) => acc + Number(s.total_consultas || 0), 0);
    document.getElementById('kpiTotalChatPublico').innerText = totalConsultasChat;

    const listaStats = document.getElementById('estadisticasChatLista');
    if (listaStats) {
        if (stats && stats.length > 0) {
            listaStats.innerHTML = stats.map(s => `
                <div class="historial-item">
                    <strong>${s.tema_detectado}:</strong> ${s.total_consultas} consultas
                </div>
            `).join('');
        } else {
            listaStats.innerHTML = '<p class="text-muted small">Sin consultas públicas registradas aún.</p>';
        }
    }
}

document.getElementById('formAdminCentro')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nuevoCentro = {
        nombre: document.getElementById('adminCentroNombre').value.trim(),
        institucion: document.getElementById('adminCentroInst').value.trim(),
        direccion: document.getElementById('adminCentroDir').value.trim(),
        servicios_jovenes: document.getElementById('adminCentroServicios').value.trim() || null,
        latitud: parseFloat(document.getElementById('adminCentroLat').value),
        longitud: parseFloat(document.getElementById('adminCentroLng').value)
    };

    const { error } = await supabase.from('centros_salud').insert(nuevoCentro);
    if (error) {
        alert('Error al guardar centro: ' + error.message);
        return;
    }

    await registrarMovimientoUsuario('Administración', 'Agregó centro de salud', nuevoCentro.nombre);
    e.target.reset();
    document.getElementById('formAdminCentro')?.classList.add('hidden');
    await cargarPanelAdmin();
    alert('Centro de salud guardado correctamente.');
});

async function eliminarCentroAdmin(id, nombre = '') {
    if (!confirm('¿Deseas eliminar este centro de salud?')) return;
    const { error } = await supabase.from('centros_salud').delete().eq('id', id);
    if (error) {
        alert('Error al eliminar: ' + error.message);
        return;
    }
    await registrarMovimientoUsuario('Administración', 'Eliminó centro de salud', `ID: ${id} ${nombre}`);
    await cargarPanelAdmin();
}

document.getElementById('formAdminNormativa')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nuevoContenido = {
        titulo: document.getElementById('adminNormTitulo').value.trim(),
        fuente_institucional: document.getElementById('adminNormFuente').value.trim(),
        categoria: document.getElementById('adminNormCategoria').value.trim(),
        resumen: document.getElementById('adminNormResumen').value.trim()
    };

    const { error } = await supabase.from('contenidos_normativos').insert(nuevoContenido);
    if (error) {
        alert('Error al publicar contenido: ' + error.message);
        return;
    }

    await registrarMovimientoUsuario('Administración', 'Publicó contenido normativo', nuevoContenido.titulo);
    e.target.reset();
    alert('Contenido normativo publicado correctamente.');
});

Object.assign(window, {
    mostrarPantalla,
    abrirLoginDesdeBienvenida,
    toggleMenuPerfil,
    irAPerfilSeccion,
    cambiarModoConversacionChat,
    enviarMensajeUsuario,
    enviarMensajePreset,
    manejarEnter,
    reiniciarChat,
    cambiarUbicacionMapa,
    buscarUbicacionPersonalizada,
    obtenerUbicacionActual,
    filtrarClinicas,
    responderMito,
    siguienteMito,
    reiniciarMitos,
    siguientePreguntaTest,
    reiniciarTest,
    iniciarImpactoQuiz,
    siguientePreguntaImpacto,
    reiniciarImpactoQuiz,
    actualizarEtiquetaSwitchRol,
    alternarModoRegistro,
    cerrarSesion,
    cambiarAvatarIcono,
    toggleFormNuevoCentro,
    filtrarTablaAdminCentros,
    filtrarTablaAdminUsuarios,
    filtrarLogsAdmin,
    exportarLogsCSV,
    eliminarCentroAdmin,
    cargarPanelAdmin
});

window.addEventListener('beforeunload', () => {
    supabase.auth.signOut();
});

actualizarVisibilidadNavegacion();
mostrarPantalla('bienvenida');