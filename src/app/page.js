"use client";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

export default function Home() {
  const mountRef = useRef(null);
  const [stats, setStats] = useState({ nodes: 0, links: 0 });
  const [loading, setLoading] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [timeline, setTimeline] = useState({ min: 0, max: 0, current: 0 });

  const stateRef = useRef({ nodes: [], links: [] });
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const CAMERA_OFFSET = { x: -300, y: 100, z: 300 };


  useEffect(() => {

    const CONFIG = {
      nodeSize: 24,
      axisSpacing: 100,
      repulsionDistance: 60,
      centerAttraction: 0.05,
      verticalStiffness: 0.2,
      linkThickness: 1.0,
      orbitRadius: 120
    };


    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050505, 0.0008);

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 10000);
    camera.position.set(CAMERA_OFFSET.x, CAMERA_OFFSET.y, CAMERA_OFFSET.z);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.sortObjects = true;
    mountRef.current.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 1.05;
    controls.maxDistance = 10000;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.5;
    controlsRef.current = controls;

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight.position.set(255, 500, 200);
    scene.add(dirLight);

    const axisGeo = new THREE.CylinderGeometry(1.5, 1.5, 10000, 32);
    const axisMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.5 });
    const centerAxis = new THREE.Mesh(axisGeo, axisMat);
    centerAxis.rotation.z = Math.PI / 2;



    scene.add(centerAxis);


    const createTextLabel = (text) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = 256;
      canvas.height = 64;
      ctx.fillStyle = 'rgba(245, 5, 5, 0)';
      ctx.fillRect(0, 0, 256, 64);
      ctx.font = 'bold 32px Arial';
      ctx.fillStyle = '#f53d05ff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 128, 32);

      const texture = new THREE.CanvasTexture(canvas);
      const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(64, 16), material);
      return mesh;
    };

    const createNode = (imgData, type, parentNode = null) => {
      const texture = new THREE.Texture(imgData.thumbnail);
      texture.needsUpdate = true;
      if (imgData.thumbnail instanceof Image && !imgData.thumbnail.complete) {
        imgData.thumbnail.onload = () => { texture.needsUpdate = true; };
      }

      const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, transparent: true });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(CONFIG.nodeSize, CONFIG.nodeSize), material);
      mesh.renderOrder = 2;

      const borderColor = type === 'central' ? 0x00FFFF : 0xFF00FF;
      const border = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: borderColor, transparent: true, opacity: 0.8 }));
      mesh.add(border); scene.add(mesh);

      return {
        id: Math.random().toString(36).substr(2, 9),
        mesh,
        velocity: new THREE.Vector3(0, 0, 0),
        data: imgData,
        type,
        parentNode,
        targetPos: new THREE.Vector3()
      };
    };

    const linkGeometryCache = new THREE.CylinderGeometry(1, 1, 1, 5);
    linkGeometryCache.rotateX(Math.PI / 2);

    const createThickLink = (nodeA, nodeB, type) => {
      if (stateRef.current.links.some(l => (l.source === nodeA && l.target === nodeB) || (l.source === nodeB && l.target === nodeA))) return;
      const isAxis = type === 'axis';
      const isRelated = type === 'related';

      const color = isAxis ? 0x00FFFF : (isRelated ? 0x00F7FF : 0x888888);
      const opacity = isAxis ? 0.6 : 0.9;

      const material = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: opacity, depthWrite: false });
      const mesh = new THREE.Mesh(linkGeometryCache, material);

      const thickness = isAxis ? CONFIG.linkThickness * 2 : (isRelated ? .5 : CONFIG.linkThickness * .5);
      mesh.scale.set(thickness, thickness, 1);

      mesh.renderOrder = 0; scene.add(mesh);
      stateRef.current.links.push({ source: nodeA, target: nodeB, type, mesh });
    };

    const animate = () => {
      requestAnimationFrame(animate);

      stateRef.current.nodes.forEach(node => {
        const pos = node.mesh.position;


        const force = new THREE.Vector3().copy(node.targetPos).sub(pos).multiplyScalar(0.05);
        node.velocity.add(force);


        stateRef.current.nodes.forEach(other => {
          if (node === other) return;

          const isSibling = node.parentNode === other.parentNode;
          const isParentChild = node.parentNode === other || other.parentNode === node;
          const isBothCentral = node.type === 'central' && other.type === 'central';

          if (isSibling || isParentChild || isBothCentral) {
            const dist = pos.distanceTo(other.mesh.position);
            if (dist < CONFIG.repulsionDistance && dist > 0.1) {
              const repulse = new THREE.Vector3().copy(pos).sub(other.mesh.position).normalize().multiplyScalar((CONFIG.repulsionDistance - dist) * 0.05);
              node.velocity.add(repulse);
            }
          }
        });

        node.velocity.multiplyScalar(0.90);
        pos.add(node.velocity);
        node.mesh.lookAt(camera.position);
      });

      stateRef.current.links.forEach(link => {
        const start = link.source.mesh.position;
        const end = link.target.mesh.position;
        link.mesh.position.copy(start).add(end).multiplyScalar(0.5);
        link.mesh.lookAt(end);
        link.mesh.scale.setZ(start.distanceTo(end));
      });

      controls.update();
      renderer.render(scene, camera);
    };
    animate();


    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);


    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const handleMouseDown = (e) => {
      if (e.target.closest('.interactive')) return;
      mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const ints = raycaster.intersectObjects(stateRef.current.nodes.map(n => n.mesh));
      if (ints.length) {
        const n = stateRef.current.nodes.find(x => x.mesh === ints[0].object);
        if (n) {
          setLightbox(n.data);
          controls.autoRotate = false;
        }
      }
    };
    window.addEventListener('mousedown', handleMouseDown);

    const renderGraph = (data) => {

      stateRef.current.nodes.forEach(n => scene.remove(n.mesh));
      stateRef.current.links.forEach(l => scene.remove(l.mesh));
      stateRef.current.nodes = [];
      stateRef.current.links = [];


      const groups = {};
      data.forEach(d => {
        if (!(d.date instanceof Date)) d.date = new Date(d.date);
        const dayKey = d.date.toDateString();
        if (!groups[dayKey]) groups[dayKey] = [];
        groups[dayKey].push(d);
      });

      const sortedKeys = Object.keys(groups).sort((a, b) => new Date(a) - new Date(b));

      const newNodes = [];
      let currentX = -((sortedKeys.length * CONFIG.axisSpacing) / 2);

      sortedKeys.forEach((key, index) => {
        const group = groups[key];

        const centralData = group[0];
        const centralNode = createNode(centralData, 'central');


        centralNode.targetPos.set(currentX, 0, 0);
        centralNode.mesh.position.copy(centralNode.targetPos);


        const label = createTextLabel(key);
        label.position.set(0, -CONFIG.nodeSize * 0.8, 0);
        centralNode.mesh.add(label);

        stateRef.current.nodes.push(centralNode);
        newNodes.push(centralNode);


        if (index > 0) {

          const lastCentral = newNodes.filter(n => n.type === 'central').slice(-2)[0];
          if (lastCentral) {
            createThickLink(lastCentral, centralNode, 'axis');
          }
        }


        const relatedData = group.slice(1);
        const angleStep = (Math.PI * 2) / (relatedData.length || 1);

        relatedData.forEach((d, rIndex) => {
          const relatedNode = createNode(d, 'related', centralNode);
          const angle = rIndex * angleStep;

          const y = Math.cos(angle) * CONFIG.orbitRadius;
          const z = Math.sin(angle) * CONFIG.orbitRadius;

          relatedNode.targetPos.set(currentX, y, z);
          relatedNode.mesh.position.copy(relatedNode.targetPos);

          stateRef.current.nodes.push(relatedNode);
          newNodes.push(relatedNode);

          createThickLink(centralNode, relatedNode, 'related');
        });

        currentX += CONFIG.axisSpacing;
      });


      centerAxis.scale.set(1, Math.max(sortedKeys.length * CONFIG.axisSpacing * 1.5, 1000), 1);


      if (newNodes.length > 0) {
        const minX = newNodes[0].targetPos.x;
        const maxX = newNodes[newNodes.length - 1].targetPos.x;
        setTimeline({ min: minX - 500, max: maxX + 500, current: minX });


        if (controlsRef.current) {
          controlsRef.current.target.set(minX, 0, 0);
          cameraRef.current.position.set(minX + CAMERA_OFFSET.x, CAMERA_OFFSET.y, CAMERA_OFFSET.z);
        }
      }

      setStats({ nodes: stateRef.current.nodes.length, links: stateRef.current.links.length });
    };





    window.addImagesToGraph = async (files) => {
      setLoading(true);
      const processFile = (file) => new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = e => {
          const i = new Image();
          i.onload = () => {

            const c = document.createElement('canvas');
            const asp = i.width / i.height;
            let w = 256, h = 256 / asp;
            if (h > 256) { h = 256; w = 256 * asp; }
            c.width = w; c.height = h;
            const ctx = c.getContext('2d');
            ctx.drawImage(i, 0, 0, w, h);

            resolve({
              src: i.src,
              thumbSrc: c.toDataURL('image/jpeg', 0.8),
              thumbnail: c,
              date: file.lastModified ? new Date(file.lastModified) : new Date()
            });
          };
          i.onerror = reject;
          i.src = e.target.result;
        };
        r.readAsDataURL(file);
      });

      const data = [];
      for (let i = 0; i < files.length; i++) { try { data.push(await processFile(files[i])); } catch (e) { } }

      renderGraph(data);


      try {

        const saveable = data.map(d => ({
          src: d.thumbSrc,
          thumbSrc: d.thumbSrc,
          date: d.date
        }));
        localStorage.setItem("timehelix_data", JSON.stringify(saveable));
        console.log("Saved " + saveable.length + " images to storage.");
      } catch (e) {
        console.error("Failed to save to localStorage (likely quota exceeded):", e);
        alert("Warning: Storage space full. Some images may not persist after refresh.");
      }

      setLoading(false);
      if (controlsRef.current) controlsRef.current.autoRotate = false;
    };


    const loadStored = () => {
      const stored = localStorage.getItem("timehelix_data");
      if (stored) {
        try {
          const parsed = JSON.parse(stored);

          const data = parsed.map(d => {
            const img = new Image();
            img.src = d.thumbSrc || d.src;
            return {
              ...d,
              date: new Date(d.date),
              thumbnail: img
            };
          });
          renderGraph(data);
          if (controlsRef.current) controlsRef.current.autoRotate = false;
        } catch (e) { console.error("Error loading stored data:", e); }
      }
    };
    loadStored();

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousedown', handleMouseDown);
      if (mountRef.current) mountRef.current.innerHTML = '';
      delete window.addImagesToGraph;
    };
  }, []);

  const handleTimelineChange = (e) => {
    const val = parseFloat(e.target.value);
    setTimeline(prev => ({ ...prev, current: val }));

    if (cameraRef.current && controlsRef.current) {
      controlsRef.current.autoRotate = false;


      controlsRef.current.target.set(val, 0, 0);


      cameraRef.current.position.set(val + CAMERA_OFFSET.x, CAMERA_OFFSET.y, CAMERA_OFFSET.z);
    }
  };

  const handleReset = () => {
    if (controlsRef.current && cameraRef.current) {
      const startX = timeline.min + 500;
      setTimeline(prev => ({ ...prev, current: startX }));

      controlsRef.current.reset();


      controlsRef.current.target.set(startX, 0, 0);

      cameraRef.current.position.set(startX + CAMERA_OFFSET.x, CAMERA_OFFSET.y, CAMERA_OFFSET.z);

      controlsRef.current.autoRotate = true;
    }
  };

  return (
    <main className="relative w-screen h-screen bg-black overflow-hidden">
      <div ref={mountRef} className="absolute inset-0 z-0" />

      {/* UI Layer */}
      <div className="relative z-10 flex flex-col h-full p-6 justify-between pointer-events-none">
        <header className="flex justify-between items-start">
          <div className="glass p-5 rounded-2xl pointer-events-auto">
            <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">TimeHelix 3D</h1>
            <p className="text-xs text-gray-400 mt-2">Horizontal Axis = Time <br /> Clusters = Same Day</p>
            <div className="flex gap-6 mt-4 text-xs font-mono text-gray-300 border-t border-gray-700 pt-3">
              <div><span className="block text-gray-500">PHOTOS</span><span className="text-xl font-bold">{stats.nodes}</span></div>
              <div><span className="block text-gray-500">LINKS</span><span className="text-xl font-bold">{stats.links}</span></div>
            </div>
          </div>

          <div className="pointer-events-auto flex flex-col gap-3 items-end">
            <label className="glass px-5 py-4 rounded-2xl cursor-pointer hover:bg-white/10 transition flex items-center gap-4 border-l-4 border-blue-500">
              <span className="material-symbols-outlined text-blue-400 text-3xl">add_photo_alternate</span>
              <div><span className="block text-sm font-bold">Upload Photos</span></div>
              <input type="file" multiple accept="image/*" className="hidden" onChange={(e) => window.addImagesToGraph && window.addImagesToGraph(e.target.files)} />
            </label>
            <button className="glass px-4 py-3 rounded-xl hover:bg-white/10 text-sm flex gap-2" onClick={handleReset}>
              Reset View
            </button>
          </div>
        </header>

        <footer className="glass p-4 rounded-xl text-xs flex flex-col gap-4 pointer-events-auto w-full max-w-2xl mx-auto mb-6">
          <div className="flex justify-between items-center text-blue-300 font-mono">
            <span>EARLY</span>
            <span>TIMELINE SCRUBBER</span>
            <span>LATE</span>
          </div>

          <input
            type="range"
            min={timeline.min}
            max={timeline.max}
            value={timeline.current}
            onChange={handleTimelineChange}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />

          <div className="flex justify-center gap-6 text-gray-400">
            <div className="flex items-center gap-2"><span className="w-8 h-1.5 bg-blue-500 rounded-full"></span> Time Axis</div>
            <div className="flex items-center gap-2"><span className="w-8 h-1.5 bg-purple-500 rounded-full"></span> Related Photos</div>
          </div>
        </footer>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-40 bg-black/95 flex items-center justify-center p-4" >
          <div className="relative max-w-5xl flex flex-col items-center">
            <div className="w-[100vw] h-[100vh] absolute -z-30 bg-black/95 flex items-center justify-center p-4" onClick={() => { setLightbox(null); if (controlsRef.current) controlsRef.current.autoRotate = true; }}></div>
            <img src={lightbox.src} className="max-h-[85vh] rounded-lg shadow-2xl border border-gray-800 z-50" />
            <div className="mt-4 flex flex-col items-center gap-2">
              <span className="text-blue-400 font-mono text-xs">{lightbox.date.toDateString()}</span>
              <button className="px-8 py-2 bg-white text-black rounded-full font-bold hover:scale-105" onClick={() => { setLightbox(null); if (controlsRef.current) controlsRef.current.autoRotate = true; }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Loader */}
      {loading && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 glass px-8 py-4 rounded-2xl flex items-center gap-4 z-50">
          <div className="w-6 h-6 border-2 border-t-blue-500 rounded-full animate-spin"></div>
          <span className="font-bold">Processing...</span>
        </div>
      )}
    </main>
  );
}