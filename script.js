/* ============================================================
   PORTAFOLIO — script.js

   Estructura:
   ──────────────────────────────────────────────────────────────
   SECCIÓN 1 — Constantes globales
   SECCIÓN 2 — Three.js: setup del renderer, escena y cámara
   SECCIÓN 3 — Plano de fondo 3D (secuencia de imágenes con Three.js)
   SECCIÓN 4 — Geometrías wireframe del hero
   SECCIÓN 5 — Galaxia de partículas (post-hero)
   SECCIÓN 6 — Comportamiento del nav al hacer scroll
   SECCIÓN 7 — Efecto luz que sigue al cursor
   SECCIÓN 8 — Parallax de cámara con el mouse
   SECCIÓN 9 — Resize handler
   SECCIÓN 10 — Bucle de animación principal
   ══════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    /* ──────────────────────────────────────────────────────────
       SECCIÓN 1 — CONSTANTES GLOBALES
       ──────────────────────────────────────────────────────────
       TOTAL    : número de imágenes en la carpeta img/
       PX_STEP  : píxeles de scroll que devuelve cada imagen
       HERO_END : scroll total (px) que dura el hero
       ────────────────────────────────────────────────────────── */
    /* Lista exacta de imágenes en img/ (los números no son consecutivos) */
    const IMG_FILES = [
        'img/00001.png','img/00002.png','img/00006.png','img/00007.png',
        'img/00008.png','img/00009.png','img/00010.png','img/00011.png',
        'img/00012.png','img/00013.png','img/00014.png','img/00015.png',
        'img/00016.png','img/00017.png','img/00018.png','img/00019.png',
        'img/00020.png','img/00021.png','img/00022.png','img/00030.png',
        'img/00031.png','img/00032.png','img/00041.png','img/00045.png',
        'img/00046.png','img/00047.png','img/00048.png','img/00049.png',
        'img/00050.png','img/00051.png','img/00052.png','img/00053.png',
        'img/00054.png','img/00055.png','img/00056.png','img/00057.png',
        'img/00058.png','img/00059.png','img/00060.png','img/00061.png',
    ];
    const TOTAL = IMG_FILES.length;      // 40
    const PX_STEP = 100;
    const HERO_END = TOTAL * PX_STEP;    // 4000 px


    /* ──────────────────────────────────────────────────────────
       SECCIÓN 2 — THREE.JS: RENDERER, ESCENA, CÁMARA
       ──────────────────────────────────────────────────────────
       Se usa el <canvas id="three-canvas"> ya existente en el DOM.
       alpha:true → fondo transparente para que los gradientes CSS
       del fixed-layer sean visibles detrás de la escena.
       ────────────────────────────────────────────────────────── */
    const canvas = document.getElementById('three-canvas');
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);   /* fondo transparente */
    renderer.setSize(window.innerWidth, window.innerHeight);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
        60,                                        /* campo de visión vertical */
        window.innerWidth / window.innerHeight,    /* relación de aspecto */
        0.1,                                       /* plano cercano */
        2000                                       /* plano lejano */
    );
    camera.position.set(0, 0, 80);   /* cámara alejada 80 unidades en Z */


    /* ──────────────────────────────────────────────────────────
       SECCIÓN 3 — PLANO DE FONDO 3D (secuencia de imágenes)
       ──────────────────────────────────────────────────────────
       Cada imagen se carga como THREE.Texture y se aplica a un
       PlaneGeometry que cubre toda la pantalla.

       EFECTOS 3D impulsados por scroll:
         · Pitch (rotX): el plano se inclina ±1.7° entre cada frame,
           creando sensación de "pasar página" volumétrica.
         · Yaw (rotY): oscilación sinusoidal lenta + snap rotativo
           en cada cambio de imagen para sentir el "clic" en 3D.
         · Camera Z: la cámara avanza suavemente hacia el plano
           mientras progresa el scroll (efecto zoom-in 3D).
         · Scale: zoom-in muy sutil acumulativo durante el hero.

       DOUBLE BUFFERING: dos planos (front/back) para hacer
       cross-fade suave entre texturas sin parpadeo.
       ────────────────────────────────────────────────────────── */

    /** Calcula el tamaño del plano para que cubra toda la pantalla
     *  con el FOV y la distancia actuales de la cámara. */
    function fullscreenPlaneSize() {
        const dist = camera.position.z;  /* distancia al plano en z=0 */
        const vFOV = THREE.MathUtils.degToRad(camera.fov);
        const height = 2 * Math.tan(vFOV / 2) * dist;
        const width = height * camera.aspect;
        return { w: width * 1.25, h: height * 1.25 };  /* margen de seguridad */
    }

    const ps = fullscreenPlaneSize();

    /* Plano frontal: muestra la imagen actual */
    const bgGeo = new THREE.PlaneGeometry(ps.w, ps.h);
    const bgMat = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 1,
        depthWrite: false,
    });
    const bgPlane = new THREE.Mesh(bgGeo, bgMat);
    bgPlane.position.z = -10;   /* ligeramente detrás de las geometrías */
    scene.add(bgPlane);

    /* Plano trasero: retiene la imagen anterior durante el cross-fade */
    const bgGeoB = new THREE.PlaneGeometry(ps.w, ps.h);
    const bgMatB = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
    });
    const bgPlaneB = new THREE.Mesh(bgGeoB, bgMatB);
    bgPlaneB.position.z = -11;   /* detrás del plano frontal */
    scene.add(bgPlaneB);

    /* ---- Carga y caché de texturas ---- */
    const loader = new THREE.TextureLoader();
    const texCache = {};   /* idx → THREE.Texture (cargado o en proceso) */
    let lastIdx = -1;
    let snapRotY = 0;    /* ángulo de snap al cambiar frame (decae rápido) */

    function imgUrl(i) {
        return IMG_FILES[i];   /* usa el nombre real del archivo */
    }

    /** Pre-carga la textura del frame i si aún no está en caché */
    function preloadTex(idx) {
        if (idx < 0 || idx >= TOTAL || texCache[idx]) return;
        texCache[idx] = loader.load(imgUrl(idx));
    }

    /** Pre-carga los frames cercanos al actual para evitar saltos */
    function preloadAround(idx) {
        for (let i = idx - 2; i <= idx + 8; i++) preloadTex(i);
    }

    /** Cambia la textura visible al frame idx.
     *  - bgPlaneB hereda la textura anterior (cross-fade)
     *  - bgPlane recibe la nueva textura
     *  - El plano trasero se desvanece reduciendo su opacidad en el loop */
    function showFrame(idx) {
        if (idx === lastIdx) return;

        /* Efecto snap: rotación en Y que decae en el bucle de animación */
        snapRotY = 0.07;
        lastIdx = idx;
        preloadAround(idx);

        const tex = texCache[idx];
        if (!tex) { preloadTex(idx); return; }

        /* Solo actualiza si la textura es diferente a la actual */
        if (bgMat.map !== tex) {
            bgMatB.map = bgMat.map;   /* el fondo retiene la anterior */
            bgMatB.opacity = 0.85;
            bgMatB.needsUpdate = true;
            bgMat.map = tex;          /* el frente muestra la nueva */
            bgMat.opacity = 1;
            bgMat.needsUpdate = true;
        }
    }

    /* Pre-cargar los primeros 10 frames al iniciar */
    for (let i = 0; i < Math.min(10, TOTAL); i++) preloadTex(i);

    /* Cargar el primer frame; al terminar, hacer visible el canvas */
    texCache[0] = loader.load(imgUrl(0), (tex) => {
        bgMat.map = tex;
        bgMat.needsUpdate = true;
        canvas.style.opacity = '1';
    });


    /* ──────────────────────────────────────────────────────────
       SECCIÓN 4 — FONDO POST-HERO (Three.js)
       ──────────────────────────────────────────────────────────
       Aparece con fade-in cuando la secuencia de imágenes termina.
       Compuesto por:
         · 2500 partículas flotantes en campo profundo (cyan/azul)
         · Malla wireframe de plano ondulante (grid sutil)
       Ambos se animan continuamente y reaccionan levemente al mouse.
       ────────────────────────────────────────────────────────── */

    /* ── Partículas flotantes ── */
    const PT_COUNT = 2500;
    const geoPts = new THREE.BufferGeometry();
    const posPts  = new Float32Array(PT_COUNT * 3);
    const colPts  = new Float32Array(PT_COUNT * 3);
    const speedPts = new Float32Array(PT_COUNT);   /* velocidad individual */

    for (let i = 0; i < PT_COUNT; i++) {
        /* Distribuidas en un volumen amplio delante de la cámara */
        posPts[i * 3]     = (Math.random() - 0.5) * 260;
        posPts[i * 3 + 1] = (Math.random() - 0.5) * 160;
        posPts[i * 3 + 2] = (Math.random() - 0.5) * 120 - 20;
        speedPts[i] = 0.3 + Math.random() * 0.7;   /* 0.3 – 1.0 */

        /* Gradiente cyan → azul según profundidad */
        const t = Math.random();
        colPts[i * 3]     = 0.05 + t * 0.15;   /* R */
        colPts[i * 3 + 1] = 0.55 - t * 0.3;    /* G */
        colPts[i * 3 + 2] = 0.95;              /* B */
    }
    geoPts.setAttribute('position', new THREE.BufferAttribute(posPts,  3));
    geoPts.setAttribute('color',    new THREE.BufferAttribute(colPts,  3));

    const matPts = new THREE.PointsMaterial({
        size: 0.55, vertexColors: true, transparent: true,
        opacity: 0, depthWrite: false,
    });
    const ptsMesh = new THREE.Points(geoPts, matPts);
    scene.add(ptsMesh);

    /* ── Malla wireframe ondulante ── */
    const GRID_W = 40, GRID_H = 24;
    const geoGrid = new THREE.PlaneGeometry(260, 160, GRID_W, GRID_H);
    const matGrid = new THREE.MeshBasicMaterial({
        color: 0x0ea5e9, wireframe: true,
        transparent: true, opacity: 0,
    });
    const gridMesh = new THREE.Mesh(geoGrid, matGrid);
    gridMesh.position.set(0, 0, -60);   /* detrás de las partículas */
    scene.add(gridMesh);


    /* ──────────────────────────────────────────────────────────
       SECCIÓN 6 — NAV: COMPORTAMIENTO AL SCROLL
       ──────────────────────────────────────────────────────────
       Mientras el scroll está dentro del hero → nav transparente.
       Al salir del hero → nav con fondo sólido oscuro + blur.
       ────────────────────────────────────────────────────────── */
    const nav = document.getElementById('main-nav');
    const stage = document.getElementById('scroll-stage');

    function updateNav(scrollY) {
        if (scrollY > HERO_END) {
            nav.style.background = 'rgba(2,6,23,0.95)';
            nav.style.backdropFilter = 'blur(12px)';
            nav.style.borderColor = 'rgba(255,255,255,0.1)';
            nav.classList.add('py-4'); nav.classList.remove('py-8');
        } else {
            nav.style.background = 'transparent';
            nav.style.backdropFilter = 'none';
            nav.style.borderColor = 'transparent';
            nav.classList.add('py-8'); nav.classList.remove('py-4');
        }
    }


    /* ──────────────────────────────────────────────────────────
       SECCIÓN 7 — LUZ QUE SIGUE AL CURSOR
       ──────────────────────────────────────────────────────────
       Actualiza la posición (left/top) de #sun-light en tiempo
       real para que el gradiente ámbar siempre esté centrado
       en el cursor del ratón.
       ────────────────────────────────────────────────────────── */
    const sun = document.getElementById('sun-light');
    window.addEventListener('mousemove', (e) => {
        sun.style.left = e.clientX + 'px';
        sun.style.top = e.clientY + 'px';
    }, { passive: true });


    /* ──────────────────────────────────────────────────────────
       SECCIÓN 8 — PARALLAX DE CÁMARA CON EL MOUSE
       ──────────────────────────────────────────────────────────
       Los valores mouseX/mouseY se normalizan a [-1, +1].
       En el bucle de animación la cámara se interpola hacia esos
       valores × factor de intensidad con lerp(a,b,0.05).
       ────────────────────────────────────────────────────────── */
    let mouseX = 0, mouseY = 0;
    window.addEventListener('mousemove', (e) => {
        mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
        mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
    }, { passive: true });


    /* ──────────────────────────────────────────────────────────
       SECCIÓN 8b — CONTROL DE INTERACCIÓN
       ──────────────────────────────────────────────────────────
       La secuencia de imágenes solo avanza cuando el usuario
       está interactuando con la página (mouse dentro o toque
       activo). Al salir, frozenScrolled queda congelado.
       ────────────────────────────────────────────────────────── */
    let isUserActive = false;
    let frozenScrolled = 0;   /* posición virtual de la secuencia */

    /* Mouse: activo cuando entra, inactivo cuando sale de la ventana */
    document.addEventListener('mouseenter', () => { isUserActive = true;  }, { passive: true });
    document.addEventListener('mouseleave', () => { isUserActive = false; }, { passive: true });

    /* Touch: activo al tocar, inactivo al soltar */
    window.addEventListener('touchstart', () => { isUserActive = true;  }, { passive: true });
    window.addEventListener('touchend',   () => { isUserActive = false; }, { passive: true });
    window.addEventListener('touchcancel',() => { isUserActive = false; }, { passive: true });


    /* ──────────────────────────────────────────────────────────
       SECCIÓN 9 — RESIZE HANDLER
       ──────────────────────────────────────────────────────────
       Actualiza el aspecto de la cámara y el tamaño del renderer
       al redimensionar la ventana. También reescala los planos de
       fondo para que sigan cubriendo toda la pantalla.
       ────────────────────────────────────────────────────────── */
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);

        /* Reescalar planos de imagen */
        const ns = fullscreenPlaneSize();
        const scX = ns.w / ps.w;
        const scY = ns.h / ps.h;
        bgPlane.scale.set(scX, scY, 1);
        bgPlaneB.scale.set(scX, scY, 1);
    });


    /* ──────────────────────────────────────────────────────────
       SECCIÓN 10 — BUCLE DE ANIMACIÓN PRINCIPAL
       ──────────────────────────────────────────────────────────
       Se ejecuta ~60 veces por segundo con requestAnimationFrame.

       Por cada frame calcula:

       heroPhase   [0→1]: progreso dentro de la zona del hero.
       galaxyPhase [0→1]: progreso del fade-in de la galaxia.

       EFECTOS 3D del plano de imagen:
         · subStep  → fracción del scroll dentro del step actual
         · targetRotX → pitch sutil entre imágenes (±1.7°)
         · targetRotY → yaw oscilante + snap en cambio de frame
         · camera.z  → avanza de 80 → 72 unidades (zoom 3D)
         · scale     → zoom-in 4% acumulativo durante el hero

       CROSS-FADE: bgMatB.opacity decae gradualmente a 0 para que
       la imagen anterior desaparezca suavemente sin código extra.
       ────────────────────────────────────────────────────────── */
    const clock = new THREE.Clock();

    /** Interpolación lineal entre a y b con factor t */
    function lerp(a, b, t) { return a + (b - a) * t; }

    function animate() {
        requestAnimationFrame(animate);

        const elapsed = clock.getElapsedTime();
        const scrollY = window.scrollY;
        const rawScrolled = scrollY - (stage ? stage.offsetTop : 0);

        /* ── Congelar scroll de imágenes si el usuario no interactúa ── */
        if (isUserActive) {
            frozenScrolled = rawScrolled;
        }
        /* scrolled es la posición virtual que controla la secuencia */
        const scrolled = frozenScrolled;

        /* ── Fase del hero [0..1] ── */
        const heroPhase = Math.max(0, Math.min(1, scrolled / HERO_END));

        /* ── Índice de frame ── */
        let frameIdx = 0;
        if (scrolled > 0) frameIdx = Math.min(TOTAL - 1, Math.floor(scrolled / PX_STEP));
        if (scrolled >= HERO_END) frameIdx = TOTAL - 1;

        /* ── Actualiza textura e imagen ── */
        showFrame(frameIdx);
        updateNav(rawScrolled);

        /* ────────────────────────────────────────────────
           EFECTOS 3D DEL PLANO DE IMAGEN (scroll-driven)
           ──────────────────────────────────────────────── */

        /* subStep: qué tan lejos estamos dentro del step actual (0→1) */
        const subStep = (scrolled % PX_STEP) / PX_STEP;

        /* Pitch (rotación X): el plano se inclina hacia arriba/abajo
           a medida que avanzamos dentro de cada frame.
           Rango: ±0.03 rad (~±1.7°) — sutil pero visible en 3D */
        const targetRotX = (subStep - 0.5) * 0.06;

        /* Yaw (rotación Y): oscilación sinusoidal lenta de "respiración"
           más el snap que se aplica al cambiar de frame */
        const targetRotY = Math.sin(elapsed * 0.3) * 0.025 + snapRotY;
        snapRotY *= 0.85;  /* el snap decae rápido (0.85^60fps ≈ 0.6s) */

        /* Interpolar suavemente hacia los ángulos objetivo */
        bgPlane.rotation.x = lerp(bgPlane.rotation.x, targetRotX, 0.1);
        bgPlane.rotation.y = lerp(bgPlane.rotation.y, targetRotY, 0.1);
        bgPlaneB.rotation.x = bgPlane.rotation.x;  /* ambos planos sincronizados */
        bgPlaneB.rotation.y = bgPlane.rotation.y;

        /* Camera Z: avanza de 80 → 72 durante el hero (zoom-in 3D real) */
        const targetCamZ = 80 - heroPhase * 8;
        camera.position.z = lerp(camera.position.z, targetCamZ, 0.04);

        /* Scale: zoom-in acumulativo muy sutil durante el hero (1 → 1.04) */
        const targetScale = 1 + heroPhase * 0.04;
        bgPlane.scale.x = lerp(bgPlane.scale.x, targetScale, 0.06);
        bgPlane.scale.y = lerp(bgPlane.scale.y, targetScale, 0.06);
        bgPlaneB.scale.x = bgPlane.scale.x;
        bgPlaneB.scale.y = bgPlane.scale.y;

        /* Cross-fade: el plano trasero (bgPlaneB) se desvanece gradualmente */
        bgMatB.opacity = Math.max(0, bgMatB.opacity - 0.06);

        /* ────────────────────────────────────────────────
           OPACIDAD: imagen hero ↔ fondo post-hero
           ──────────────────────────────────────────────── */

        /* Progreso de salida del hero [0→1] en los últimos 400px */
        const exitPhase = Math.max(0, Math.min(1, (rawScrolled - (HERO_END - 400)) / 400));

        /* El plano de imagen se desvanece al salir del hero */
        bgMat.opacity   = Math.max(0, 1 - exitPhase * 1.5);

        /* El fondo post-hero aparece cuando la imagen se va */
        const bgPhase = Math.max(0, Math.min(1, (rawScrolled - HERO_END) / 350));
        matPts.opacity  = bgPhase * 0.9;
        matGrid.opacity = bgPhase * 0.055;

        /* El canvas siempre está visible (hero o fondo post-hero) */
        canvas.style.opacity = '1';

        /* ────────────────────────────────────────────────
           ANIMACIÓN PARTÍCULAS
           ──────────────────────────────────────────────── */
        const posAttr = geoPts.getAttribute('position');
        for (let i = 0; i < PT_COUNT; i++) {
            /* Deriva vertical sinusoidal individual */
            posAttr.setY(i,
                posPts[i * 3 + 1] +
                Math.sin(elapsed * speedPts[i] * 0.5 + i * 0.35) * 2.5
            );
            /* Deriva horizontal muy lenta */
            posAttr.setX(i,
                posPts[i * 3] +
                Math.cos(elapsed * speedPts[i] * 0.25 + i * 0.2) * 1.2
            );
        }
        posAttr.needsUpdate = true;

        /* ────────────────────────────────────────────────
           ANIMACIÓN GRID ONDULANTE
           ──────────────────────────────────────────────── */
        const gridPos = geoGrid.getAttribute('position');
        const gW1 = GRID_W + 1, gH1 = GRID_H + 1;
        for (let iy = 0; iy < gH1; iy++) {
            for (let ix = 0; ix < gW1; ix++) {
                const idx = iy * gW1 + ix;
                const ox = (ix / GRID_W - 0.5) * 4;
                const oy = (iy / GRID_H - 0.5) * 4;
                gridPos.setZ(idx,
                    Math.sin(ox + elapsed * 0.5) * 3 +
                    Math.cos(oy + elapsed * 0.4) * 2
                );
            }
        }
        gridPos.needsUpdate = true;
        geoGrid.computeVertexNormals();

        /* Rotación lenta de la malla post-hero */
        gridMesh.rotation.x = -0.25 + Math.sin(elapsed * 0.08) * 0.05;

        /* ────────────────────────────────────────────────
           PARALLAX DE CÁMARA (X/Y con el mouse)
           ──────────────────────────────────────────────── */
        camera.position.x = lerp(camera.position.x, mouseX * 8, 0.05);
        camera.position.y = lerp(camera.position.y, mouseY * -4, 0.05);
        camera.lookAt(scene.position);

        renderer.render(scene, camera);
    }

    animate();

})();
