# Dlivery — Plataforma P2P de Entregas

## Credenciales semilla (siempre)

- **Super Admin**
  - Email: `davidksinc@gmail.com`
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



## Nuevo: planificador inteligente de rutas por empresa

Se agregó un flujo para clientes corporativos con prioridad mensual:

- Endpoint: `POST /deliveries/smart-plan` (requiere JWT).
- Recibe hasta 200 paquetes con coordenadas y tipo de vehículo.
- Genera rutas óptimas desde punto inicial a punto final con desviación máxima configurable (default 3km por paquete).
- Devuelve círculos y polilíneas para visualizar/configurar en mapa por un admin.
- Incluye ranking de conductores por disponibilidad + cercanía + rating.
- Si un conductor rechaza un viaje asignado: `POST /drivers/deliveries/:delivery_id/decline` reasigna al siguiente conductor elegible por ranking; si no hay candidato vuelve al pool.
- Admin/Super Admin puede monitorear conductores activos en mapa con `GET /admin/drivers/live-locations`; mientras estén activos se actualiza su posición y, al desconectarse, queda guardada su última ubicación conocida.

## Configuración recomendada en Google Cloud (producción)

Para evitar errores de CORS/red como `CORS request did not succeed` al hacer login:

- **Frontend (`.env`)**
  - `REACT_APP_API_URL=https://dlivery.sancarlosenlinea.com`
  - `REACT_APP_SOCKET_URL=https://dlivery.sancarlosenlinea.com`
  - Evita usar `:3001` en HTTPS público, salvo que ese puerto esté realmente expuesto con TLS válido.

- **Backend (`backend/.env`)**
  - `PORT=3001`
  - `FRONTEND_ORIGIN=https://dlivery.sancarlosenlinea.com`
  - Puedes agregar varios dominios separados por comas, por ejemplo: `FRONTEND_ORIGIN=https://dlivery.sancarlosenlinea.com,https://admin.dlivery.com`

- **Nginx / Load Balancer**
  - Publica solamente `443` y enruta `/` al frontend y `/auth`, `/deliveries`, `/drivers`, `/payments`, `/admin`, `/health` al backend interno.
  - Si usas reverse proxy por mismo dominio, el frontend debe consumir el backend por **mismo origen** (sin puerto público adicional).

## Diagnóstico de login en Google Cloud (sin tocar código adicional)

Se agregaron mejoras para estabilizar login y detectar cuellos de botella de infraestructura:

- Endpoint de diagnóstico backend: `GET /ops/diagnostics`.
- Healthcheck de DB: `GET /health`.
- Storage fallback local: si faltan `SUPABASE_URL` y `SUPABASE_ANON_KEY`, los archivos se guardan en `backend/data/uploads` y se sirven en `/uploads/*`.
- Seeds de credenciales controlados por `.env` (`SEED_*`).

### Checklist de puertos / security bridge recomendado

1. **Firewall GCP / VPC**
   - Exponer únicamente `80/443` públicamente.
   - Mantener `3001` como puerto interno (loopback o red privada).
2. **Reverse proxy (Nginx/Load Balancer)**
   - `https://dlivery.sancarlosenlinea.com/` -> frontend.
   - `https://dlivery.sancarlosenlinea.com/auth|deliveries|drivers|payments|admin|health|ops` -> backend interno `127.0.0.1:3001`.
3. **CORS**
   - `FRONTEND_ORIGIN=https://dlivery.sancarlosenlinea.com`.
4. **Egress a DB**
   - Si usas Supabase, confirmar salida TCP/5432 habilitada.
   - Si no hay egress confiable, usar PostgreSQL local interno.

## PostgreSQL local interno (alternativa a Supabase)

Puedes mover la DB al mismo servidor para evitar bloqueo de salida y latencia:

1. Instalar PostgreSQL localmente.
2. Crear DB/usuario:

```sql
CREATE USER dlivery WITH PASSWORD 'cambiar_password';
CREATE DATABASE dlivery OWNER dlivery;
```

3. En `backend/.env`:

```env
DATABASE_URL=postgresql://dlivery:cambiar_password@127.0.0.1:5432/dlivery
PG_SSL=false
```

4. Reiniciar backend; el bootstrap crea/ajusta esquema y usuarios semilla automáticamente.
