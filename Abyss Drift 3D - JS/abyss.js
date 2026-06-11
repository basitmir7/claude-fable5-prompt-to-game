(function(){
    "use strict";
  
    // ---------- Renderer / scene ----------
    const canvas = document.getElementById('game');
    const renderer = new THREE.WebGLRenderer({canvas, antialias:true});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x04101c);
    scene.fog = new THREE.FogExp2(0x04101c, 0.028);
  
    const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 200);
    camera.position.set(0, 0.6, 8);
  
    const ambient = new THREE.AmbientLight(0x335566, 1.0);
    scene.add(ambient);
    const playerLight = new THREE.PointLight(0x5ef2d6, 2.2, 26);
    scene.add(playerLight);
    const topLight = new THREE.DirectionalLight(0x88bbee, 0.5);
    topLight.position.set(0, 10, 5);
    scene.add(topLight);
  
    // ---------- Bounds ----------
    const BOUND_X = 6, BOUND_Y = 3.4;
  
    // ---------- Player ----------
    const player = new THREE.Group();
    const orbGeo = new THREE.SphereGeometry(0.42, 24, 24);
    const orbMat = new THREE.MeshStandardMaterial({
      color:0x9ffbe9, emissive:0x2ad4b4, emissiveIntensity:1.2, roughness:.3, metalness:.1
    });
    const orb = new THREE.Mesh(orbGeo, orbMat);
    player.add(orb);
    const haloGeo = new THREE.SphereGeometry(0.62, 20, 20);
    const haloMat = new THREE.MeshBasicMaterial({color:0x5ef2d6, transparent:true, opacity:.14});
    player.add(new THREE.Mesh(haloGeo, haloMat));
    // small fins
    const finMat = new THREE.MeshStandardMaterial({color:0x5ef2d6, emissive:0x1a8f78, transparent:true, opacity:.85});
    const finGeo = new THREE.ConeGeometry(0.16, 0.5, 8);
    const finL = new THREE.Mesh(finGeo, finMat); finL.position.set(-0.45,0,0.1); finL.rotation.z = Math.PI/2;
    const finR = new THREE.Mesh(finGeo, finMat); finR.position.set(0.45,0,0.1); finR.rotation.z = -Math.PI/2;
    player.add(finL, finR);
    scene.add(player);
    const PLAYER_R = 0.45;
  
    // ---------- Trail particles ----------
    const TRAIL_N = 90;
    const trailGeo = new THREE.BufferGeometry();
    const trailPos = new Float32Array(TRAIL_N*3);
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
    const trail = new THREE.Points(trailGeo, new THREE.PointsMaterial({
      color:0x5ef2d6, size:.14, transparent:true, opacity:.55, depthWrite:false
    }));
    scene.add(trail);
    let trailIdx = 0;
  
    // ---------- Drifting plankton ----------
    const PLANK_N = 320, PLANK_DEPTH = 80;
    const plankGeo = new THREE.BufferGeometry();
    const plankPos = new Float32Array(PLANK_N*3);
    for(let i=0;i<PLANK_N;i++){
      plankPos[i*3]   = (Math.random()-0.5)*30;
      plankPos[i*3+1] = (Math.random()-0.5)*16;
      plankPos[i*3+2] = -Math.random()*PLANK_DEPTH;
    }
    plankGeo.setAttribute('position', new THREE.BufferAttribute(plankPos,3));
    const plankton = new THREE.Points(plankGeo, new THREE.PointsMaterial({
      color:0x7fd8ff, size:.08, transparent:true, opacity:.5, depthWrite:false
    }));
    scene.add(plankton);
  
    // ---------- Sea floor & ceiling ribs ----------
    const ribMat = new THREE.MeshStandardMaterial({color:0x0a2438, roughness:.9});
    const ribs = [];
    for(let i=0;i<14;i++){
      const rib = new THREE.Mesh(new THREE.TorusGeometry(9, .25, 8, 40), ribMat);
      rib.position.z = -i*7;
      scene.add(rib);
      ribs.push(rib);
    }
  
    // ---------- Obstacles ----------
    const obstacles = [];
    const rockMat = new THREE.MeshStandardMaterial({color:0x14384f, roughness:.85, flatShading:true});
    const jellyMat = new THREE.MeshStandardMaterial({
      color:0xff7e6b, emissive:0xb03a2c, emissiveIntensity:.8, transparent:true, opacity:.85, flatShading:true
    });
    const urchinMat = new THREE.MeshStandardMaterial({
      color:0x6b4dff, emissive:0x3a22b0, emissiveIntensity:.7, flatShading:true
    });
  
    function makeObstacle(z){
      const type = Math.random();
      let mesh, radius;
      if(type < 0.45){ // rock pillar from top or bottom
        const h = 2.5 + Math.random()*3;
        mesh = new THREE.Mesh(new THREE.CylinderGeometry(.6+Math.random()*.5, .9+Math.random()*.6, h, 7), rockMat);
        const fromTop = Math.random() < .5;
        mesh.position.set((Math.random()-0.5)*BOUND_X*2, fromTop ? BOUND_Y+1.2-h/2 : -BOUND_Y-1.2+h/2, z);
        radius = .95;
        mesh.userData.spin = 0;
      } else if(type < 0.78){ // jellyfish, bobs vertically
        mesh = new THREE.Mesh(new THREE.SphereGeometry(.8, 10, 8, 0, Math.PI*2, 0, Math.PI*0.6), jellyMat);
        mesh.position.set((Math.random()-0.5)*BOUND_X*2, (Math.random()-0.5)*BOUND_Y*2, z);
        mesh.userData.bob = Math.random()*Math.PI*2;
        mesh.userData.bobSpeed = .8 + Math.random()*1.4;
        radius = .8;
        mesh.userData.spin = 0;
      } else { // spinning urchin
        mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(.9, 0), urchinMat);
        mesh.position.set((Math.random()-0.5)*BOUND_X*2, (Math.random()-0.5)*BOUND_Y*2, z);
        mesh.userData.spin = (Math.random()<.5?-1:1) * (0.6 + Math.random());
        radius = .9;
      }
      mesh.userData.radius = radius;
      scene.add(mesh);
      obstacles.push(mesh);
    }
  
    // ---------- Input ----------
    const input = {x:0, y:0};
    const keys = {};
    addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; });
    addEventListener('keyup',   e => { keys[e.key.toLowerCase()] = false; });
  
    let touchActive = false, touchX = 0, touchY = 0, touchTX = 0, touchTY = 0;
    addEventListener('touchstart', e => {
      touchActive = true;
      touchX = e.touches[0].clientX; touchY = e.touches[0].clientY;
      touchTX = player.position.x; touchTY = player.position.y;
    }, {passive:true});
    addEventListener('touchmove', e => {
      if(!touchActive) return;
      const dx = (e.touches[0].clientX - touchX) / innerWidth * 16;
      const dy = (e.touches[0].clientY - touchY) / innerHeight * 10;
      touchTX = THREE.MathUtils.clamp(player.position.x + dx, -BOUND_X, BOUND_X);
      touchTY = THREE.MathUtils.clamp(player.position.y - dy, -BOUND_Y, BOUND_Y);
      touchX = e.touches[0].clientX; touchY = e.touches[0].clientY;
    }, {passive:true});
    addEventListener('touchend', () => { touchActive = false; });
  
    // ---------- Game state ----------
    const scoreEl = document.getElementById('score');
    const bestEl = document.getElementById('best');
    const startScreen = document.getElementById('startScreen');
    const overScreen = document.getElementById('overScreen');
    const finalScoreEl = document.getElementById('finalScore');
    const newBestEl = document.getElementById('newBest');
    const hurt = document.getElementById('hurt');
    const hint = document.getElementById('hint');
  
    let running = false, depth = 0, best = 0, speed = 14;
    let shake = 0, spawnTimer = 0;
    let vx = 0, vy = 0;
  
    function resetGame(){
      obstacles.forEach(o => scene.remove(o));
      obstacles.length = 0;
      for(let z = -25; z > -90; z -= 9) makeObstacle(z + (Math.random()-.5)*4);
      player.position.set(0,0,0);
      vx = vy = 0;
      depth = 0; speed = 14; spawnTimer = 0;
      for(let i=0;i<TRAIL_N*3;i++) trailPos[i] = 0;
    }
  
    function startGame(){
      resetGame();
      running = true;
      startScreen.classList.add('hidden');
      overScreen.classList.add('hidden');
      hint.style.opacity = .4;
    }
  
  function gameOver(){
      running = false;
      shake = 1;
      hurt.style.opacity = 1;
      setTimeout(()=>hurt.style.opacity = 0, 200);
      const d = Math.floor(depth);
      finalScoreEl.textContent = d + ' m';
      if(d > best){
        best = d;
        bestEl.textContent = best + ' m';
        newBestEl.textContent = 'New personal best';
      } else {
        newBestEl.textContent = '';
      }
      setTimeout(()=>overScreen.classList.remove('hidden'), 350);
    }
  
    document.getElementById('startBtn').addEventListener('click', startGame);
    document.getElementById('retryBtn').addEventListener('click', startGame);
    addEventListener('keydown', e => {
      if(e.key === 'Enter' && !running &&
         (!startScreen.classList.contains('hidden') || !overScreen.classList.contains('hidden'))){
        startGame();
      }
    });
  
    // ---------- Resize ----------
    function resize(){
      renderer.setSize(innerWidth, innerHeight);
      camera.aspect = innerWidth/innerHeight;
      camera.updateProjectionMatrix();
    }
    addEventListener('resize', resize);
    resize();
  
    // ---------- Main loop ----------
    let last = performance.now();
    function loop(now){
      requestAnimationFrame(loop);
      const dt = Math.min((now - last)/1000, 0.05);
      last = now;
      const t = now/1000;
  
      // ambient drift for plankton + ribs always animate
      plankton.rotation.z = Math.sin(t*.05)*.05;
      const pp = plankGeo.attributes.position.array;
      for(let i=0;i<PLANK_N;i++){
        pp[i*3+2] += (running ? speed*.4 : 2.2)*dt;
        if(pp[i*3+2] > 8) pp[i*3+2] -= PLANK_DEPTH;
      }
      plankGeo.attributes.position.needsUpdate = true;
  
      if(running){
        // input
        input.x = (keys['arrowright']||keys['d']?1:0) - (keys['arrowleft']||keys['a']?1:0);
        input.y = (keys['arrowup']||keys['w']?1:0) - (keys['arrowdown']||keys['s']?1:0);
  
        const ACC = 46, DRAG = 6.5, MAXV = 11;
        vx += input.x*ACC*dt; vy += input.y*ACC*dt;
        vx -= vx*DRAG*dt;     vy -= vy*DRAG*dt;
        vx = THREE.MathUtils.clamp(vx,-MAXV,MAXV);
        vy = THREE.MathUtils.clamp(vy,-MAXV,MAXV);
        player.position.x += vx*dt;
        player.position.y += vy*dt;
  
        if(touchActive){
          player.position.x += (touchTX - player.position.x)*12*dt;
          player.position.y += (touchTY - player.position.y)*12*dt;
          vx = vy = 0;
        }
  
        player.position.x = THREE.MathUtils.clamp(player.position.x, -BOUND_X, BOUND_X);
        player.position.y = THREE.MathUtils.clamp(player.position.y, -BOUND_Y, BOUND_Y);
  
        // banking + idle bob
        player.rotation.z = THREE.MathUtils.lerp(player.rotation.z, -vx*.06, .15);
        player.rotation.x = THREE.MathUtils.lerp(player.rotation.x,  vy*.05, .15);
        orb.position.y = Math.sin(t*3)*.06;
        finL.rotation.x = Math.sin(t*8)*.4;
        finR.rotation.x = -Math.sin(t*8)*.4;
  
        // difficulty + score
        speed += dt*0.55;
        depth += speed*dt*0.9;
        scoreEl.textContent = Math.floor(depth) + ' m';
  
        // spawn
        spawnTimer -= dt;
        if(spawnTimer <= 0){
          makeObstacle(-90 - Math.random()*10);
          spawnTimer = Math.max(0.28, 9/speed);
        }
  
        // move obstacles & collide
        for(let i=obstacles.length-1;i>=0;i--){
          const o = obstacles[i];
          o.position.z += speed*dt;
          if(o.userData.spin) o.rotation.x = o.rotation.y += o.userData.spin*dt;
          if(o.userData.bobSpeed){
            o.userData.bob += o.userData.bobSpeed*dt;
            o.position.y += Math.sin(o.userData.bob)*dt*1.6;
            o.scale.y = 1 + Math.sin(o.userData.bob*2)*.12;
          }
          if(o.position.z > 10){
            scene.remove(o);
            obstacles.splice(i,1);
            continue;
          }
          // collision (sphere vs sphere, cylinder approximated as capsule on y)
          const dx = o.position.x - player.position.x;
          const dz = o.position.z - player.position.z;
          let dy = o.position.y - player.position.y;
          if(o.geometry.type === 'CylinderGeometry'){
            const halfH = o.geometry.parameters.height/2;
            dy = Math.max(0, Math.abs(dy) - halfH);
          }
          const distSq = dx*dx + dy*dy + dz*dz;
          const rr = o.userData.radius + PLAYER_R;
          if(distSq < rr*rr) gameOver();
        }
      }
  
      // trail
      trailPos[trailIdx*3]   = player.position.x + (Math.random()-.5)*.15;
      trailPos[trailIdx*3+1] = player.position.y + (Math.random()-.5)*.15;
      trailPos[trailIdx*3+2] = player.position.z - .3;
      trailIdx = (trailIdx+1)%TRAIL_N;
      for(let i=0;i<TRAIL_N;i++) trailPos[i*3+2] += (running?speed:2)*dt;
      trailGeo.attributes.position.needsUpdate = true;
  
      // ribs scroll
      ribs.forEach(r => {
        r.position.z += (running?speed:2.2)*dt;
        if(r.position.z > 10) r.position.z -= 14*7;
      });
  
      // camera follow + shake
      shake = Math.max(0, shake - dt*2.5);
      const sx = (Math.random()-.5)*shake*.6;
      const sy = (Math.random()-.5)*shake*.6;
      camera.position.x = THREE.MathUtils.lerp(camera.position.x, player.position.x*.5, .08) + sx;
      camera.position.y = THREE.MathUtils.lerp(camera.position.y, player.position.y*.5 + .6, .08) + sy;
      camera.lookAt(player.position.x*.6, player.position.y*.6, -12);
  
      playerLight.position.copy(player.position);
      playerLight.intensity = 2.2 + Math.sin(t*5)*.3;
  
      renderer.render(scene, camera);
    }
    requestAnimationFrame(loop);
  })();