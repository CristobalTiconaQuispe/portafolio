/* ============================================================
   PORTAFOLIO — script.js

   Estructura:
   ──────────────────────────────────────────────────────────────
   SECCIÓN 1 — Constantes globales (dos secuencias)
   SECCIÓN 2 — Three.js: setup del renderer, escena y cámara
   SECCIÓN 3 — Planos de fondo 3D (doble secuencia con Three.js)
   SECCIÓN 4 — Geometrías wireframe del hero
   SECCIÓN 5 — Partículas y grid post-hero
   SECCIÓN 6 — Comportamiento del nav al hacer scroll
   SECCIÓN 7 — Efecto luz que sigue al cursor
   SECCIÓN 8 — Parallax de cámara con el mouse
   SECCIÓN 9 — Resize handler
   SECCIÓN 10 — Bucle de animación principal
   SECCIÓN 11 — Botón de cambio de secuencia
   ══════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    /* ──────────────────────────────────────────────────────────
       SECCIÓN 1 — CONSTANTES GLOBALES (DOS SECUENCIAS)
       ──────────────────────────────────────────────────────────
       Secuencia 0 → img/   (.webp)  — principal
       Secuencia 1 → img2/  (.png)   — alternativa

       PX_STEP : píxeles de scroll por imagen
       ────────────────────────────────────────────────────────── */
    const SEQUENCES = [
        { folder: 'img',  ext: 'webp' },
        { folder: 'img2', ext: 'png'  },
    ];
    const PX_STEP = 100;

    /* Estado de secuencia activa */
    let activeSeq = 0;          /* 0 o 1 */
    let seqSwitching = false;   /* evita clics dobles durante la transición */

    /** Genera el path de la imagen n en la secuencia seq */
    function imgPath(seq, n) {
        const { folder, ext } = SEQUENCES[seq];
        return `${folder}/${String(n).padStart(5, '0')}.${ext}`;
    }

    /** Comprueba si la imagen n existe en la secuencia seq */
    function imageExists(seq, n) {
        return new Promise(resolve => {
            const img = new Image();
            img.onload  = () => resolve(true);
            img.onerror = () => resolve(false);
            img.src = imgPath(seq, n);
        });
    }

    /**
     * Detecta cuántas imágenes hay en la secuencia seq
     * mediante búsqueda binaria. Llama callback(count).
     */
    function detectImageCount(seq, callback) {
        let lo = 0, hi = 1;

        function findUpper() {
            imageExists(seq, hi).then(found => {
                if (found) { lo = hi; hi *= 2; findUpper(); }
                else { binarySearch(); }
            });
        }

        function binarySearch() {
            if (hi - lo <= 1) { callback(lo); return; }
            const mid = Math.floor((lo + hi) / 2);
            imageExists(seq, mid).then(found => {
                if (found) lo = mid; else hi = mid;
                binarySearch();
            });
        }

        findUpper();
    }

    /* Detectar ambas secuencias en paralelo, luego arrancar el sistema */
    let counts = [0, 0];
    let detected = 0;

    function onBothDetected() {
        if (detected < 2) return;
        if (counts[0] === 0) { console.warn('No se encontraron imágenes en', SEQUENCES[0].folder); return; }
        if (counts[1] === 0) { console.warn('No se encontraron imágenes en', SEQUENCES[1].folder); }
        initSystem(counts[0], counts[1]);
    }

    detectImageCount(0, (c) => { counts[0] = c; detected++; onBothDetected(); });
    detectImageCount(1, (c) => { counts[1] = c; detected++; onBothDetected(); });


    /* ══════════════════════════════════════════════════════════
       SISTEMA PRINCIPAL — se inicia tras detectar ambas secuencias
       ══════════════════════════════════════════════════════════ */
    function initSystem(COUNT0, COUNT1) {

        /* Arrays de paths para cada secuencia */
        const FILES = [
            Array.from({ length: COUNT0 }, (_, i) => imgPath(0, i + 1)),
            Array.from({ length: COUNT1 }, (_, i) => imgPath(1, i + 1)),
        ];
        const TOTALS = [FILES[0].length, FILES[1].length];

        /* Scroll total basado en la secuencia principal (0) */
        const HERO_END = TOTALS[0] * PX_STEP;

        /* Actualizar altura del scroll-stage con el total de la secuencia principal */
        const stage = document.getElementById('scroll-stage');
        if (stage) stage.style.height = `calc(100vh + ${TOTALS[0] * PX_STEP}px)`;


        /* ──────────────────────────────────────────────────────────
           SECCIÓN 2 — THREE.JS: RENDERER, ESCENA, CÁMARA
           ────────────────────────────────────────────────────────── */
        const canvas = document.getElementById('three-canvas');
        const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setClearColor(0x000000, 0);
        renderer.setSize(window.innerWidth, window.innerHeight);

        const scene  = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(
            60,
            window.innerWidth / window.innerHeight,
            0.1,
            2000
        );
        camera.position.set(0, -5, 80);


        /* ──────────────────────────────────────────────────────────
           SECCIÓN 3 — PLANOS DE FONDO (DOS SECUENCIAS)
           ──────────────────────────────────────────────────────────
           Cada secuencia tiene un par front/back para cross-fade.
           La secuencia inactiva tiene opacity=0.
           ────────────────────────────────────────────────────────── */

        function fullscreenPlaneSize() {
            const dist = camera.position.z;
            const vFOV = THREE.MathUtils.degToRad(camera.fov);
            const height = 2 * Math.tan(vFOV / 2) * dist;
            const width  = height * camera.aspect;
            return { w: width * 1.25, h: height * 1.25 };
        }

        const ps = fullscreenPlaneSize();

        /* ── Helper: crea un par de planos front/back ── */
        function createPlanePair(zFront, zBack, initialOpacity) {
            const geo  = new THREE.PlaneGeometry(ps.w, ps.h);
            const mat  = new THREE.MeshBasicMaterial({ transparent: true, opacity: initialOpacity, depthWrite: false });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.z = zFront;
            scene.add(mesh);

            const geoB  = new THREE.PlaneGeometry(ps.w, ps.h);
            const matB  = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
            const meshB = new THREE.Mesh(geoB, matB);
            meshB.position.z = zBack;
            scene.add(meshB);

            return { mesh, mat, meshB, matB };
        }

        /* Secuencia 0 (img/) — visible al inicio */
        const seq0 = createPlanePair(-10, -11, 1);
        /* Secuencia 1 (img2/) — oculta al inicio, detrás de seq0 */
        const seq1 = createPlanePair(-10, -11, 0);

        /* Lista para iterar fácilmente */
        const seqPlanes = [seq0, seq1];

        /* ---- Carga y caché de texturas independientes por secuencia ---- */
        const loader    = new THREE.TextureLoader();
        const texCaches = [{}, {}];   /* [seqIdx][frameIdx] → THREE.Texture */
        const lastIdx   = [-1, -1];   /* último frame mostrado por secuencia */
        let   snapRotY  = 0;

        function preloadTex(seqIdx, idx) {
            if (idx < 0 || idx >= TOTALS[seqIdx] || texCaches[seqIdx][idx]) return;
            texCaches[seqIdx][idx] = loader.load(FILES[seqIdx][idx]);
        }

        function preloadAround(seqIdx, idx) {
            for (let i = idx - 2; i <= idx + 8; i++) preloadTex(seqIdx, i);
        }

        /** Muestra el frame idx en la secuencia seqIdx */
        function showFrame(seqIdx, idx) {
            const clampedIdx = Math.min(Math.max(0, idx), TOTALS[seqIdx] - 1);
            if (clampedIdx === lastIdx[seqIdx]) return;

            if (seqIdx === activeSeq) snapRotY = 0.07;
            lastIdx[seqIdx] = clampedIdx;
            preloadAround(seqIdx, clampedIdx);

            const tex = texCaches[seqIdx][clampedIdx];
            if (!tex) { preloadTex(seqIdx, clampedIdx); return; }

            const { mat, matB, mesh } = seqPlanes[seqIdx];
            if (mat.map !== tex) {
                matB.map      = mat.map;
                matB.opacity  = Math.min(0.85, mat.opacity);
                matB.needsUpdate = true;
                mat.map       = tex;
                mat.needsUpdate = true;
            }
        }

        /* Pre-cargar primeros frames de ambas secuencias */
        for (let i = 0; i < Math.min(10, TOTALS[0]); i++) preloadTex(0, i);
        for (let i = 0; i < Math.min(6,  TOTALS[1]); i++) preloadTex(1, i);

        /* Cargar primer frame de seq0 y hacer visible el canvas */
        texCaches[0][0] = loader.load(FILES[0][0], (tex) => {
            seq0.mat.map = tex;
            seq0.mat.needsUpdate = true;
            canvas.style.opacity = '1';
        });
        /* Cargar primer frame de seq1 en background */
        texCaches[1][0] = loader.load(FILES[1][0]);


        /* ──────────────────────────────────────────────────────────
           SECCIÓN 11 — CAMBIO DE SECUENCIA
           ──────────────────────────────────────────────────────────
           Fade cruzado entre los dos pares de planos.
           El índice de frame se comparte → la animación continúa
           exactamente donde estaba.
           ────────────────────────────────────────────────────────── */

        const switchBtn   = document.getElementById('seq-switch-btn');
        const seqLabel    = document.getElementById('seq-label');
        const seqIndicator = document.getElementById('seq-indicator');

        /* Progreso de la transición: 0 = seq0 totalmente visible
                                      1 = seq1 totalmente visible */
        let seqBlend = 0;        /* 0..1 */
        let seqTarget = 0;       /* 0..1, saltamos al hacer clic */

        function switchSequence() {
            if (seqSwitching) return;
            seqSwitching = true;

            activeSeq = activeSeq === 0 ? 1 : 0;
            seqTarget = activeSeq;   /* el loop lo interpola suavemente */

            /* Actualizar texto e indicador del botón */
            if (seqLabel) {
                seqLabel.textContent = activeSeq === 0 ? 'Sec. 2' : 'Sec. 1';
            }
            if (seqIndicator) {
                seqIndicator.setAttribute('data-active', activeSeq);
            }

            /* Actualizar clase activa del botón */
            if (switchBtn) {
                switchBtn.classList.toggle('seq-active', activeSeq === 1);
            }

            /* Desbloquear después de que termine la transición (≈400ms) */
            setTimeout(() => { seqSwitching = false; }, 500);
        }

        if (switchBtn) switchBtn.addEventListener('click', switchSequence);


        /* ──────────────────────────────────────────────────────────
           SECCIÓN 4 — PARTÍCULAS Y GRID POST-HERO
           ────────────────────────────────────────────────────────── */
        const PT_COUNT = 2500;
        const geoPts   = new THREE.BufferGeometry();
        const posPts   = new Float32Array(PT_COUNT * 3);
        const colPts   = new Float32Array(PT_COUNT * 3);
        const speedPts = new Float32Array(PT_COUNT);

        for (let i = 0; i < PT_COUNT; i++) {
            posPts[i * 3]     = (Math.random() - 0.5) * 260;
            posPts[i * 3 + 1] = (Math.random() - 0.5) * 160;
            posPts[i * 3 + 2] = (Math.random() - 0.5) * 120 - 20;
            speedPts[i] = 0.3 + Math.random() * 0.7;
            const t = Math.random();
            colPts[i * 3]     = 0.05 + t * 0.15;
            colPts[i * 3 + 1] = 0.55 - t * 0.3;
            colPts[i * 3 + 2] = 0.95;
        }
        geoPts.setAttribute('position', new THREE.BufferAttribute(posPts, 3));
        geoPts.setAttribute('color',    new THREE.BufferAttribute(colPts, 3));

        const matPts = new THREE.PointsMaterial({
            size: 0.55, vertexColors: true, transparent: true,
            opacity: 0, depthWrite: false,
        });
        const ptsMesh = new THREE.Points(geoPts, matPts);
        scene.add(ptsMesh);

        const GRID_W = 40, GRID_H = 24;
        const geoGrid = new THREE.PlaneGeometry(260, 160, GRID_W, GRID_H);
        const matGrid = new THREE.MeshBasicMaterial({
            color: 0x0ea5e9, wireframe: true,
            transparent: true, opacity: 0,
        });
        const gridMesh = new THREE.Mesh(geoGrid, matGrid);
        gridMesh.position.set(0, 0, -60);
        scene.add(gridMesh);


        /* ──────────────────────────────────────────────────────────
           SECCIÓN 6 — NAV
           ────────────────────────────────────────────────────────── */
        const nav      = document.getElementById('main-nav');
        const navStage = document.getElementById('scroll-stage');

        function updateNav(scrollY) {
            if (scrollY > HERO_END) {
                nav.style.background    = 'rgba(2,6,23,0.95)';
                nav.style.backdropFilter = 'blur(12px)';
                nav.style.borderColor   = 'rgba(255,255,255,0.1)';
                nav.classList.add('py-4'); nav.classList.remove('py-8');
            } else {
                nav.style.background    = 'transparent';
                nav.style.backdropFilter = 'none';
                nav.style.borderColor   = 'transparent';
                nav.classList.add('py-8'); nav.classList.remove('py-4');
            }
        }

        /* Visibilidad del botón de secuencia: solo durante el hero */
        function updateSwitchBtn(scrollY) {
            if (!switchBtn) return;
            /* Mostrar durante el hero + 200px de margen */
            const visible = scrollY < HERO_END + 200;
            switchBtn.style.opacity   = visible ? '1' : '0';
            switchBtn.style.pointerEvents = visible ? 'auto' : 'none';
        }


        /* ──────────────────────────────────────────────────────────
           SECCIÓN 7 — LUZ DEL CURSOR
           ────────────────────────────────────────────────────────── */
        const sun = document.getElementById('sun-light');
        window.addEventListener('mousemove', (e) => {
            sun.style.left = e.clientX + 'px';
            sun.style.top  = e.clientY + 'px';
        }, { passive: true });


        /* ──────────────────────────────────────────────────────────
           SECCIÓN 8 — PARALLAX + INTERACCIÓN
           ────────────────────────────────────────────────────────── */
        let mouseX = 0, mouseY = 0;
        window.addEventListener('mousemove', (e) => {
            mouseX = (e.clientX / window.innerWidth  - 0.5) * 2;
            mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
        }, { passive: true });

        let isUserActive  = false;
        let frozenScrolled = 0;

        document.addEventListener('mouseenter',  () => { isUserActive = true;  }, { passive: true });
        document.addEventListener('mouseleave',  () => { isUserActive = false; }, { passive: true });
        window.addEventListener('touchstart',    () => { isUserActive = true;  }, { passive: true });
        window.addEventListener('touchend',      () => { isUserActive = false; }, { passive: true });
        window.addEventListener('touchcancel',   () => { isUserActive = false; }, { passive: true });


        /* ──────────────────────────────────────────────────────────
           SECCIÓN 9 — RESIZE HANDLER
           ────────────────────────────────────────────────────────── */
        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);

            const ns  = fullscreenPlaneSize();
            const scX = ns.w / ps.w;
            const scY = ns.h / ps.h;

            [seq0, seq1].forEach(({ mesh, meshB }) => {
                mesh.scale.set(scX, scY, 1);
                meshB.scale.set(scX, scY, 1);
            });
        });


        /* ──────────────────────────────────────────────────────────
           SECCIÓN 10 — BUCLE DE ANIMACIÓN PRINCIPAL
           ────────────────────────────────────────────────────────── */
        const clock = new THREE.Clock();
        function lerp(a, b, t) { return a + (b - a) * t; }

        function animate() {
            requestAnimationFrame(animate);

            const elapsed  = clock.getElapsedTime();
            const scrollY  = window.scrollY;
            const rawScrolled = scrollY - (navStage ? navStage.offsetTop : 0);

            if (isUserActive) frozenScrolled = rawScrolled;
            const scrolled = frozenScrolled;

            /* ── Fase del hero ── */
            const heroPhase = Math.max(0, Math.min(1, scrolled / HERO_END));

            /* ── Índice de frame compartido ── */
            let frameIdx = 0;
            if (scrolled > 0) frameIdx = Math.min(TOTALS[activeSeq] - 1, Math.floor(scrolled / PX_STEP));
            if (scrolled >= HERO_END) frameIdx = TOTALS[activeSeq] - 1;

            /* ── Actualizar ambas secuencias con el frame actual ──
               La activa muestra el frame correcto, la inactiva también
               se mantiene sincronizada para que el cambio sea inmediato. */
            const frame0 = Math.min(frameIdx, TOTALS[0] - 1);
            const frame1 = Math.min(frameIdx, TOTALS[1] - 1);
            showFrame(0, frame0);
            showFrame(1, frame1);

            updateNav(rawScrolled);
            updateSwitchBtn(rawScrolled);

            /* ── Transición suave de opacidad entre secuencias ──
               seqBlend interpola hacia seqTarget (0 o 1). */
            seqBlend = lerp(seqBlend, seqTarget, 0.08);

            /* Opacidad de seq0: máxima cuando seqBlend=0, 0 cuando seqBlend=1 */
            const op0 = 1 - seqBlend;
            /* Opacidad de seq1: 0 cuando seqBlend=0, máxima cuando seqBlend=1 */
            const op1 = seqBlend;

            /* Aplicar opacidades a los planos frontales de cada secuencia
               (el cross-fade interno por cambio de frame se maneja en showFrame) */
            seq0.mat.opacity = Math.max(0, op0 - seq0.matB.opacity * 0.5 + seq0.matB.opacity);
            seq1.mat.opacity = Math.max(0, op1);

            /* ── Efectos 3D del plano activo ── */
            const subStep    = (scrolled % PX_STEP) / PX_STEP;
            const targetRotX = (subStep - 0.5) * 0.06;
            const targetRotY = Math.sin(elapsed * 0.3) * 0.025 + snapRotY;
            snapRotY *= 0.85;

            /* Aplicar rotaciones a ambos pares (sincronizan visualmente) */
            [seq0, seq1].forEach(({ mesh, meshB }) => {
                mesh.rotation.x  = lerp(mesh.rotation.x,  targetRotX, 0.1);
                mesh.rotation.y  = lerp(mesh.rotation.y,  targetRotY, 0.1);
                meshB.rotation.x = mesh.rotation.x;
                meshB.rotation.y = mesh.rotation.y;
            });

            /* Camera Z zoom-in */
            const targetCamZ = 80 - heroPhase * 8;
            camera.position.z = lerp(camera.position.z, targetCamZ, 0.04);

            /* Scale zoom-in */
            const targetScale = 1 + heroPhase * 0.04;
            [seq0, seq1].forEach(({ mesh, meshB }) => {
                mesh.scale.x  = lerp(mesh.scale.x,  targetScale, 0.06);
                mesh.scale.y  = lerp(mesh.scale.y,  targetScale, 0.06);
                meshB.scale.x = mesh.scale.x;
                meshB.scale.y = mesh.scale.y;
            });

            /* Cross-fade interno (imagen anterior → nueva) */
            seq0.matB.opacity = Math.max(0, seq0.matB.opacity - 0.06) * op0;
            seq1.matB.opacity = Math.max(0, seq1.matB.opacity - 0.06) * op1;

            /* ── Fade de salida del hero ── */
            const exitPhase = Math.max(0, Math.min(1, (rawScrolled - (HERO_END - 400)) / 400));
            const imgOpacity = Math.max(0, 1 - exitPhase * 1.5);
            seq0.mat.opacity *= imgOpacity;
            seq1.mat.opacity *= imgOpacity;

            /* ── Post-hero: partículas y grid ── */
            const bgPhase   = Math.max(0, Math.min(1, (rawScrolled - HERO_END) / 350));
            matPts.opacity  = bgPhase * 0.9;
            matGrid.opacity = bgPhase * 0.055;

            canvas.style.opacity = '1';

            /* ── Partículas ── */
            const posAttr = geoPts.getAttribute('position');
            for (let i = 0; i < PT_COUNT; i++) {
                posAttr.setY(i, posPts[i * 3 + 1] + Math.sin(elapsed * speedPts[i] * 0.5 + i * 0.35) * 2.5);
                posAttr.setX(i, posPts[i * 3]     + Math.cos(elapsed * speedPts[i] * 0.25 + i * 0.2)  * 1.2);
            }
            posAttr.needsUpdate = true;

            /* ── Grid ondulante ── */
            const gridPos = geoGrid.getAttribute('position');
            const gW1 = GRID_W + 1, gH1 = GRID_H + 1;
            for (let iy = 0; iy < gH1; iy++) {
                for (let ix = 0; ix < gW1; ix++) {
                    const idx = iy * gW1 + ix;
                    const ox  = (ix / GRID_W - 0.5) * 4;
                    const oy  = (iy / GRID_H - 0.5) * 4;
                    gridPos.setZ(idx, Math.sin(ox + elapsed * 0.5) * 3 + Math.cos(oy + elapsed * 0.4) * 2);
                }
            }
            gridPos.needsUpdate = true;
            geoGrid.computeVertexNormals();
            gridMesh.rotation.x = -0.25 + Math.sin(elapsed * 0.08) * 0.05;

            /* ── Parallax cámara ── */
            camera.position.x = lerp(camera.position.x, mouseX * 8,      0.05);
            camera.position.y = lerp(camera.position.y, mouseY * -4 - 5, 0.05);
            camera.lookAt(scene.position);

            renderer.render(scene, camera);
        }

        animate();

    } /* fin initSystem */

})();
