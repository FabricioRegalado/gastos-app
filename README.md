# Gastos App (React + Vite)

Aplicación minimalista para llevar control de deudas y gastos personales.

Características principales
- Manejador de deudas: `one-time` (una vez), `installments` (cuotas) y `recurring` (recurrentes).
- Mini-calendario visual para ver vencimientos y marcar cuotas pagadas (`src/components/MiniCalendar.jsx`).
- Soporte de periodicidades: `monthly` (mensual), `quincena` (cada 15 días), `weekly` (semanal) y `annual` (anual).
- Cálculos y visualizaciones:
  - **Total restante**: suma de cuotas no pagadas + deudas `one-time` pendientes.
  - **Próx. vencimiento**: total que vence en la próxima fecha (se muestra en el resumen).
- Persistencia local en `localStorage` (`deudas`, `whatsappPhone`).

Estructura relevante
- `src/App.jsx`: lógica principal, formularios y UI.
- `src/components/MiniCalendar.jsx`: componente del mini-calendario.
- `src/index.css`, `src/App.css`: estilos globales.

Instalación y ejecución (PowerShell)
  - Ejecuta: `npm install` y luego `npm run dev`

Construir para producción
  - Ejecuta: `npm run build` y luego `npm run preview`

Uso rápido
- Agregar deuda: pulsa `+` y completa el formulario. La `Fecha de registro` se asigna automáticamente.
- Tipos:
  - `Una vez`: tienes la opción `Fecha exigible / Vencimiento` (si no la pones, se usa la fecha de registro).
  - `Cuotas`: indica número de cuotas, primer vencimiento y periodicidad.
  - `Recurrente`: selecciona periodicidad y próximo vencimiento; al registrar pago se avanza la próxima fecha.
- En la lista de tarjetas rápidas verás: monto total de la deuda y un badge con la cantidad de la próxima cuota.
- Abre `Ver calendario` en una deuda a cuotas para ver todas las cuotas y marcarlas como pagadas.

Notas sobre cálculos
- Las cuotas (`installments`) suman en **Total restante** únicamente las cuotas pendientes.
- Los `recurring` no se incluyen en el total restante por defecto (porque son obligaciones periódicas); en su lugar aparecen en **Próx. vencimiento**. Si prefieres incluirlos en el total restante, puedo cambiar la regla.

Formato de datos y migración
- La app hace una migración básica al arrancar para generar `schedule` en deudas antiguas con `type: "installments"` y sin `schedule`.
- Los montos se normalizan al leer (soportando strings con comas y `$`). Si tienes datos antiguos con formatos inconsistentes puedo añadir una migración más agresiva.

Testing manual
- Para verificar periodicidades nuevas crea ejemplos con `Semanal` y `Anual` y revisa el calendario y el avance de `nextDue`.

Siguientes mejoras sugeridas
- Validar/forzar `nextDue` para `one-time` en el formulario (opcional).
- Migración para normalizar `localStorage` y convertir montos a números definitivos.
- Añadir filtros por periodicidad y exportar datos.

Contacto
- Número de WhatsApp (se guarda localmente en la configuración): `Ajustes`  `Número de WhatsApp`.

Licencia
- Código provisto sin licencia explícita en el repo (añadir `LICENSE` si quieres publicar).
