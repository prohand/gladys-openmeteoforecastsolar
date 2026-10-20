# Open-Meteo Forecast Solar

Esta integración estima lo que producirán sus paneles solares, hoy y mañana, a partir de la
previsión meteorológica gratuita de [Open-Meteo](https://open-meteo.com). Sin cuenta, sin clave
de API: funciona en cuanto se instala.

Es una integración **cloud**: Gladys debe poder acceder a `api.open-meteo.com` por internet.
Necesita Gladys 5.1 o posterior.

## Antes de empezar

La previsión se hace para la **ubicación de su casa en Gladys** (**Ajustes → Casas**). Al
instalarla, Gladys le pide que autorice a la integración a leerla. Si sus paneles están en
otro lugar, escribirá sus coordenadas en la configuración.

Tenga a mano la descripción de sus paneles:

- su **potencia pico**: la suma de las potencias de sus etiquetas (10 paneles de 400 W =
  4 kWp);
- su **inclinación**: 0° planos, 90° verticales, a menudo de 30° a 45° en un tejado inclinado;
- su **orientación**: la dirección hacia la que miran, como en una brújula (180° = sur).

## Configuración

Abra **Integraciones → Open-Meteo Forecast Solar → Configuración**:

| Campo                    | Qué escribir                                                                                                |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Potencia pico (kWp)      | Potencia pico total de los paneles, en kilovatios.                                                          |
| Inclinación (°)          | 0 = planos, 90 = verticales. 30 por defecto.                                                                |
| Orientación (°)          | 0 = norte, 90 = este, 180 = sur, 270 = oeste. 180 por defecto.                                              |
| Pérdidas del sistema (%) | Inversor, cables, suciedad, envejecimiento. 14 por defecto. Bájelo si las estimaciones son demasiado bajas. |
| Umbral de producción (W) | La potencia que usa el disparador «La producción estimada cruza el umbral». 1000 W por defecto.             |
| Actualización (min)      | Minutos entre dos llamadas a Open-Meteo, 15 como mínimo. 30 por defecto.                                    |
| Latitud / Longitud       | Solo para paneles lejos de su casa. Deje ambos vacíos para usar la ubicación de su casa de Gladys.          |

Guarde y haga clic en **Probar la previsión**: la respuesta muestra la producción estimada de
hoy y de mañana, y el pico del día. Después abra la pestaña **Descubrimiento** y añada el
dispositivo **Solar forecast**.

## El dispositivo

| Función                               | Significado                                            |
| ------------------------------------- | ------------------------------------------------------ |
| Estimated power now (W)               | Lo que los paneles deberían producir en este momento.  |
| Estimated power next hour (W)         | La potencia media esperada en los próximos 60 minutos. |
| Estimated peak power today (W)        | La potencia más alta del día.                          |
| Estimated production today (kWh)      | Todo el día, de medianoche a medianoche.               |
| Estimated production left today (kWh) | Lo que queda por venir hoy.                            |
| Estimated production tomorrow (kWh)   | Todo el día de mañana.                                 |

Puede cambiar el nombre del dispositivo y de sus funciones al añadirlo. La potencia se
recalcula cada minuto; Open-Meteo se vuelve a llamar en el intervalo de actualización de la
configuración. Son **previsiones**: la monitorización de energía de Gladys nunca las cuenta
como producción real.

## Escenas

La integración añade sus propias tarjetas al editor de escenas, en la categoría
**Integraciones**.

### Disparadores

- **La producción estimada cruza el umbral** — inicia la escena cuando la potencia estimada
  sube por encima del umbral de la configuración, o vuelve a bajar. Elija **Sube por encima** o
  **Baja por debajo** (o déjelo vacío para ambos). La escena puede leer
  `{{triggerEvent.data.power}}` (potencia estimada, W), `{{triggerEvent.data.threshold}}` y
  `{{triggerEvent.data.direction}}` (`above` o `below`).
- **Previsión solar actualizada** — inicia la escena con cada nueva previsión (en el intervalo
  de actualización). Variables: `energy_today`, `energy_remaining_today`, `energy_tomorrow`
  (kWh), `peak_power_today` (W) y `peak_time_today` (`HH:MM`).

### Acciones

- **Obtener la previsión solar** — pasa las cifras actuales a las acciones siguientes:
  potencia ahora, próxima hora y pico (W), producción hoy, restante y mañana (kWh), hora del
  pico. Active **Llamar primero a Open-Meteo** para obtener antes una previsión nueva.
  `available` es falso mientras no haya previsión.
- **Buscar la franja más soleada** — busca la franja de una duración dada (redondeada al cuarto
  de hora) con la mayor producción estimada, **hoy** (a partir de ahora) o **mañana**.
  Salidas: `found`, `start` y `end` (`HH:MM`), `energy` (kWh) y `average_power` (W).

Ejemplo: cada noche a las 21:00, ejecute **Buscar la franja más soleada** (3 horas, mañana) y
envíese el mensaje «Poner el lavavajillas mañana entre {{0.0.start}} y {{0.0.end}}».

## Panel de control

Edite un panel y añada el widget **Previsión solar**. Muestra la potencia estimada ahora y la
producción de hoy y de mañana (en directo), la curva de producción de ambos días con el pico,
lo que queda de hoy, su instalación, su ubicación y la hora de la última actualización. El
botón **Actualizar** llama a Open-Meteo al instante.

## Solución de problemas

- **«Sin ubicación»**: indique la ubicación de su casa en **Ajustes → Casas**, o escriba una
  latitud y una longitud en la configuración.
- **«No se pudo contactar con Open-Meteo»**: Gladys no tiene acceso a internet, u Open-Meteo no
  funciona. La última previsión sigue visible (punto naranja en el indicador del dispositivo)
  y la integración vuelve a intentarlo cada 5 minutos.
- **Las estimaciones son siempre demasiado altas o bajas**: ajuste las **Pérdidas del
  sistema**. La sombra y la nieve no se tienen en cuenta.
- Los registros de la integración están en **Ajustes → Integraciones → Open-Meteo Forecast
  Solar → Registros**.

## Créditos

Datos meteorológicos de [Open-Meteo.com](https://open-meteo.com/), bajo licencia
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). La API gratuita de Open-Meteo es
para uso no comercial.
