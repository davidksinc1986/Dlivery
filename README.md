# Dlivery — Plataforma P2P de Entregas

## Credenciales semilla (siempre)

- **Super Admin**
  - Email: `davidksin@gmail.com`
  - Password: `M@davi19!`

- **Usuario de prueba (bypass de reglas de hold/captura)**
  - Email: `usertest@dlivery.local`
  - Password: `usertest`

- **Chofer de prueba (bypass de reglas de hold/captura)**
  - Email: `drivertest@dlivery.local`
  - Password: `drivertest`

## Flujo de pago actual

1. Al crear una entrega normal, se autoriza un **hold** de pago (no se captura todavía).
2. Si el viaje se completa dentro de 24h, el hold se **captura**.
3. Si no se completa en 24h, el hold se **libera automáticamente**.
4. El pago al conductor queda retenido para liquidación manual semanal (lunes siguiente) desde el panel admin.

## Matching inteligente para viajes directos

Los viajes directos inmediatos intentan asignarse automáticamente al mejor conductor con un score ponderado por:
- calificación
- tiempo esperando online
- cercanía

Además se crea una notificación prioritaria para el conductor elegido.

## Pool de ofertas + viajes programados

- **Pool de ofertas** se mantiene: cliente puede sugerir monto y se publica para conductores cercanos.
- **Viaje programado**: nuevo campo para agendar fecha/hora, permitiendo preparación en viajes largos.

> Los usuarios de prueba `usertest` y `drivertest` bypassan este flujo para testing rápido.

## Frontend

```bash
npm install
npm start
```

## Backend

```bash
cd backend
npm install
npm run dev
```

