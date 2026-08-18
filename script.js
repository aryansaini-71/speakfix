/* ==========================================================================
   SPEAKFIX — site behaviour
   Sections: nav, scroll reveal, image-placeholder fallback, tech-logo
   fallback glyphs, hardware callouts, and the STL enclosure viewer.
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initReveal();
  initMediaPlaceholders();
  initStackGlyphs();
  initCallouts();
  initViewer();
});

/* ---------------------------------------------------------------------- */
/* Nav: solid-on-scroll + mobile menu                                     */
/* ---------------------------------------------------------------------- */
function initNav() {
  const nav = document.getElementById('nav');
  const toggle = document.getElementById('navToggle');

  const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 8);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  nav.querySelectorAll('.nav__links a').forEach(a => {
    a.addEventListener('click', () => {
      nav.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
    });
  });
}

/* ---------------------------------------------------------------------- */
/* Scroll-triggered fade-ins                                              */
/* ---------------------------------------------------------------------- */
function initReveal() {
  const items = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    items.forEach(el => el.classList.add('is-visible'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const siblingDelay = [...el.parentElement.children].indexOf(el) * 70;
        setTimeout(() => el.classList.add('is-visible'), siblingDelay);
        io.unobserve(el);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });

  items.forEach(el => io.observe(el));
}

/* ---------------------------------------------------------------------- */
/* Media-frame placeholders                                               */
/* Real <img> stays live; if it 404s (file not dropped in yet) we swap    */
/* in a clean "add this file" placeholder instead of a broken image icon. */
/* ---------------------------------------------------------------------- */
function initMediaPlaceholders() {
  document.querySelectorAll('.media-frame[data-placeholder]').forEach(frame => {
    const img = frame.querySelector('img');
    if (!img) return;

    const filename = frame.dataset.filename || 'image.png';
    const label = frame.dataset.label || 'Image';

    const showPlaceholder = () => {
      frame.classList.add('is-placeholder');
      if (!frame.querySelector('.media-frame__placeholder')) {
        const ph = document.createElement('div');
        ph.className = 'media-frame__placeholder';
        ph.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="2"/>
            <circle cx="8.5" cy="9.5" r="1.5"/>
            <path d="M21 16l-5.5-5.5a2 2 0 0 0-2.8 0L3 20"/>
          </svg>
          <strong>${label}</strong>
          <code>images/${filename}</code>
          <span class="hint">Drop the file in — it'll appear here automatically</span>`;
        frame.appendChild(ph);
      }
    };

    if (img.complete && img.naturalWidth > 0) {
      frame.classList.add('is-loaded');
    } else {
      img.addEventListener('load', () => frame.classList.add('is-loaded'));
      img.addEventListener('error', showPlaceholder);
    }
  });
}

/* ---------------------------------------------------------------------- */
/* "Built with" logos — fall back to a hand-drawn glyph when the real     */
/* logo file hasn't been added yet.                                      */
/* ---------------------------------------------------------------------- */
const GLYPHS = {
  raspberrypi: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2"><circle cx="24" cy="26" r="14"/><path d="M24 12V6M17 9l2 5M31 9l-2 5" stroke-linecap="round"/><circle cx="18" cy="24" r="2.4" fill="currentColor" stroke="none"/><circle cx="30" cy="24" r="2.4" fill="currentColor" stroke="none"/><path d="M17 32c3 2.4 11 2.4 14 0" stroke-linecap="round"/></svg>`,
  python: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M24 6c-8 0-8 4-8 4v6h8"/><path d="M17 10h11v6a4 4 0 0 1-4 4h-6a4 4 0 0 0-4 4v6"/><path d="M24 42c8 0 8-4 8-4v-6h-8"/><path d="M31 38H20v-6a4 4 0 0 1 4-4h6a4 4 0 0 0 4-4v-6"/><circle cx="19.5" cy="12.5" r="1" fill="currentColor"/><circle cx="28.5" cy="35.5" r="1" fill="currentColor"/></svg>`,
  azure: `<svg viewBox="0 0 48 48" fill="currentColor" stroke="none"><path d="M18.5 6h11.6L18.4 30.3 30 30.3 15.8 42 5 27.4l9.3-3.1z"/><path d="M30.9 8 20 30.5h13L21.7 42 43 20.6H29.6z" opacity="0.55"/></svg>`,
  foundry: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="7" y="7" width="14" height="14" rx="1.5"/><rect x="27" y="7" width="14" height="14" rx="1.5"/><rect x="7" y="27" width="14" height="14" rx="1.5"/><rect x="27" y="27" width="14" height="14" rx="1.5"/></svg>`,
  openscad: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M24 5 41 14.5v19L24 43 7 33.5v-19z"/><path d="M7 14.5 24 24l17-9.5M24 24v19"/></svg>`
};

function initStackGlyphs() {
  document.querySelectorAll('.stack-card').forEach(card => {
    const img = card.querySelector('img');
    const glyphSpan = card.querySelector('.stack-card__fallback-glyph');
    if (!img || !glyphSpan) return;
    const key = glyphSpan.dataset.glyph;
    if (GLYPHS[key]) glyphSpan.innerHTML = GLYPHS[key];

    const showFallback = () => {
      card.classList.add('is-placeholder');
      glyphSpan.hidden = false;
    };
    if (img.complete && img.naturalWidth > 0) {
      card.classList.add('is-loaded');
    } else {
      img.addEventListener('load', () => card.classList.add('is-loaded'));
      img.addEventListener('error', showFallback);
    }
  });
}

/* ---------------------------------------------------------------------- */
/* Hardware cutaway callouts <-> legend                                   */
/* ---------------------------------------------------------------------- */
function initCallouts() {
  const callouts = document.querySelectorAll('.callout');
  const legendItems = document.querySelectorAll('.cutaway__legend li');

  const activate = (id) => {
    legendItems.forEach(li => li.classList.toggle('is-active', li.id === id));
    callouts.forEach(c => c.classList.toggle('is-active', c.dataset.target === id));
  };

  callouts.forEach(c => {
    c.addEventListener('mouseenter', () => activate(c.dataset.target));
    c.addEventListener('focus', () => activate(c.dataset.target));
    c.addEventListener('click', (e) => {
      e.preventDefault();
      const el = document.getElementById(c.dataset.target);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      activate(c.dataset.target);
    });
  });
  legendItems.forEach(li => {
    li.addEventListener('mouseenter', () => activate(li.id));
  });
}

/* ---------------------------------------------------------------------- */
/* Enclosure — interactive STL viewer (three.js)                          */
/* Falls back to a plain message if three.js/CDN or WebGL is unavailable. */
/* ---------------------------------------------------------------------- */
function initViewer() {
  const stage = document.getElementById('viewerStage');
  const canvas = document.getElementById('viewerCanvas');
  const loadingEl = document.getElementById('viewerLoading');
  const fallbackEl = document.getElementById('viewerFallback');
  const tabs = document.querySelectorAll('.viewer__tab');
  if (!stage || !canvas) return;

  const hasThree = typeof THREE !== 'undefined' && THREE.STLLoader && THREE.OrbitControls;
  const hasGLTF = hasThree && !!THREE.GLTFLoader;
  if (!hasThree) {
    loadingEl.classList.add('is-hidden');
    fallbackEl.hidden = false;
    return;
  }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (e) {
    loadingEl.classList.add('is-hidden');
    fallbackEl.hidden = false;
    return;
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 5000);
  camera.position.set(0, 0, 180);

  const controls = new THREE.OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 1.4;
  controls.minDistance = 20;
  controls.maxDistance = 800;
  controls.screenSpacePanning = false;
  // explicit single-finger rotate / two-finger pinch-zoom on touch devices
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  canvas.style.touchAction = 'none';

  controls.addEventListener('start', () => { controls.autoRotate = false; });

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const key = new THREE.DirectionalLight(0x1c6aa8, 1.1);
  key.position.set(4, 6, 6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xf2b705, 0.7);
  rim.position.set(-5, -2, -4);
  scene.add(rim);

  const material = new THREE.MeshStandardMaterial({
    color: 0x1c6aa8,
    metalness: 0.15,
    roughness: 0.55
  });

  let currentObject = null;
  const stlLoader = new THREE.STLLoader();
  const gltfLoader = hasGLTF ? new THREE.GLTFLoader() : null;

  function fitStage() {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return; // stage not laid out yet (e.g. mid-transition) — skip and wait for the next observed resize
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function disposeObject3D(object) {
    object.traverse((node) => {
      if (node.geometry) node.geometry.dispose();
      if (node.material) {
        const mats = Array.isArray(node.material) ? node.material : [node.material];
        mats.forEach((m) => {
          Object.keys(m).forEach((propName) => {
            const val = m[propName];
            if (val && val.isTexture) val.dispose();
          });
          m.dispose();
        });
      }
    });
  }

  // Centers and scales any loaded object (STL mesh or GLTF scene) to a consistent
  // on-screen size, regardless of the pivot/scale/units it arrived with.
  function placeObject(object, { rotateZUpToYUp } = {}) {
    if (rotateZUpToYUp) object.rotation.x = -Math.PI / 2; // STL is Z-up; three.js scene is Y-up. glTF is already Y-up per spec.
    object.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(object);
    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scale = 110 / maxDim;

    // position is applied after scale in the local->world transform, so offset by
    // the pre-scale center scaled down, not the raw center.
    object.position.copy(center).multiplyScalar(-scale);
    object.scale.setScalar(scale);
  }

  function showModel(object, opts) {
    if (currentObject) {
      scene.remove(currentObject);
      disposeObject3D(currentObject);
    }
    placeObject(object, opts);
    currentObject = object;
    scene.add(object);
    controls.autoRotate = true;
    loadingEl.classList.add('is-hidden');
  }

  function onLoadError() {
    loadingEl.classList.add('is-hidden');
    fallbackEl.hidden = false;
  }

  function loadModel(url, type) {
    loadingEl.classList.remove('is-hidden');
    fallbackEl.hidden = true;

    if (type === 'gltf') {
      if (!gltfLoader) { onLoadError(); return; }
      gltfLoader.load(
        url,
        (gltf) => {
          // GLTF models carry their own per-part vertex colors / materials — use as-is.
          showModel(gltf.scene, { rotateZUpToYUp: false });
        },
        undefined,
        onLoadError
      );
    } else {
      stlLoader.load(
        url,
        (geometry) => {
          geometry.computeVertexNormals();
          const mesh = new THREE.Mesh(geometry, material);
          showModel(mesh, { rotateZUpToYUp: true });
        },
        undefined,
        onLoadError
      );
    }
  }

  fitStage();
  window.addEventListener('resize', fitStage);
  if ('ResizeObserver' in window) {
    new ResizeObserver(fitStage).observe(stage);
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('is-active'));
      tab.classList.add('is-active');
      loadModel(tab.dataset.model, tab.dataset.type || 'stl');
    });
  });

  const firstTab = tabs[0];
  loadModel(firstTab ? firstTab.dataset.model : 'models/enclosure-base.stl', firstTab ? (firstTab.dataset.type || 'stl') : 'stl');

  (function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  })();
}

/* ---------------------------------------------------------------------- */
/* GitHub link — fill in once the repo exists                             */
/* ---------------------------------------------------------------------- */
document.querySelectorAll('[data-github-link]').forEach(a => {
  if (a.getAttribute('href') === '#') {
    a.setAttribute('title', 'Add your repository URL in index.html (data-github-link)');
  }
});
