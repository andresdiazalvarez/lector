# Lector

Aplicación web para convertir documentos y textos en voz. La lectura se realiza directamente en el navegador, sin enviar el contenido de los archivos a un servidor.

## Funciones

- Carga de documentos PDF, DOCX, TXT, RTF, HTML, Markdown, CSV y JSON.
- Lectura en voz alta utilizando las voces instaladas en el dispositivo.
- Velocidades de reproducción: 1×, 1,25×, 1,75× y 2×.
- Avance y retroceso de 10 o 30 segundos.
- Navegación entre párrafos.
- Selección de voz.
- Seguimiento y resaltado del texto durante la lectura.
- Posibilidad de pegar y editar texto directamente.
- Diseño adaptable para ordenador y móvil.

## Aplicación publicada

[Abrir Lector](https://lectora-documentos.ingenierotecni3.chatgpt.site)

## Ejecutar en local

Se necesita Node.js 22.13 o una versión posterior.

```bash
npm install
npm run dev
```

Después, abre la dirección local que aparece en la terminal.

## Crear la versión de producción

```bash
npm run build
```

## Privacidad

Los documentos se procesan dentro del navegador. Lector no necesita cuentas y no almacena el contenido cargado por el usuario.

## Tecnologías

React, TypeScript, vinext, PDF.js y Mammoth.
