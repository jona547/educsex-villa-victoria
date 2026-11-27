# EducSex Villa Victoria

Plataforma web educativa enfocada en salud sexual y reproductiva para adolescentes en **Villa Victoria, Estado de México**, desarrollada como proyecto escolar para **CECyTEM** bajo un enfoque informativo, preventivo y alineado con la **NOM-047-SSA2-2015**, estadísticas del **INEGI** y recursos institucionales de salud como **IMSS Bienestar** e **ISEM**.

## Módulos y funcionalidades

* **Inicio y autenticación:** acceso de usuarios y roles (`Administrador` y `Usuario General`) con perfiles vinculados a Supabase Auth.
* **Normativa:** consulta de información normativa y estadística institucional.
* **Centros de salud:** directorio y geolocalización de unidades médicas y servicios juveniles en Villa Victoria, Estado de México.
* **Chatbot:** asistente informativo con registro de temas consultados en el chatbot público y privacidad en conversaciones privadas.
* **Mitos y realidades:** módulo interactivo para contrastar creencias comunes con información respaldada.
* **Test educativo:** evaluación interactiva con seguimiento de avance, puntaje, historial y registro de resultados.
* **Estadística e impacto:** visualización de datos e indicadores relacionados con salud sexual y reproductiva juvenil.
* **Consola técnica de administración (Panel Admin):** monitoreo de usuarios registrados, bitácora de movimientos (`Audit Log`), gestión de centros de salud, publicación de contenido normativo/INEGI y exportación de auditoría en CSV.

## Tecnologías utilizadas

* **Frontend:** HTML5, CSS3, JavaScript (ES Modules) y Bootstrap 5.
* **Backend y base de datos:** Supabase (PostgreSQL, autenticación y políticas de seguridad a nivel de fila / RLS).
* **Recursos visuales locales:** `cecytem-logo.png` y `chatbot-avatar.jpeg`.

## Estructura del proyecto

```text
EducSex/
├── index.html
├── style.css
├── script.js
├── schema.sql
├── README.md
├── cecytem-logo.png
└── chatbot-avatar.jpeg