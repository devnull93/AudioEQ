document.addEventListener("DOMContentLoaded", () => {
    let audioContext;
    let audioSource;
    let bassFilter;
    let trebleFilter;
    let analyser;
    let gainNode;

    let isPlaying = false;
    let animationId;
    let startTime = 0;
    let pauseTime = 0;
    let bufferDuration = 0;

    const audioFile = document.getElementById("audioFile");
    const fileName = document.getElementById("fileName");
    const status = document.getElementById("status");
    const waveform = document.getElementById("waveform");
    const ctx = waveform.getContext("2d");
    const bassSlider = document.getElementById("bassSlider");
    const trebleSlider = document.getElementById("trebleSlider");
    const bassValue = document.getElementById("bassValue");
    const trebleValue = document.getElementById("trebleValue");
    const playBtn = document.getElementById("playBtn");
    const stopBtn = document.getElementById("stopBtn");
    const timeDisplay = document.getElementById("timeDisplay");

    function showStatus(msg) {
       status.textContent = msg;
    }

    function clearStatus() {
       status.textContent = "";
    }

    function initAudioContext() {
       if (audioContext) return true;

       try {
            audioContext = new AudioContext();
            bassFilter = audioContext.createBiquadFilter();
            bassFilter.type = "lowshelf";
            bassFilter.frequency.value = 200;
            bassFilter.gain.value = 0;
            trebleFilter = audioContext.createBiquadFilter();
            trebleFilter.type = "highshelf";
            trebleFilter.frequency.value = 3000;
            trebleFilter.gain.value = 0;
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            gainNode = audioContext.createGain();
            return true;
       } catch(err) {
            showStatus(`Audio Error: ${err.message}`);
            return false;
       }
    }

    async function resumeContext() {
       if (!audioContext) return false;
       if (audioContext.state === "suspended") {
           await audioContext.resume();
       }
       return audioContext.state === "running";
    }

    audioFile.addEventListener("change", async (e) => {
       const file = e.target.files[0];
       if (!file) return;
       fileName.querySelector("span").textContent = file.name;
       fileName.style.display = "block";
       showStatus("Loading file...");

       if (!initAudioContext()) return;

       try {
            const arrayBuffer = await file.arrayBuffer();
            audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            bufferDuration = audioBuffer.duration;
            drawStaticWaveform(audioBuffer);
            playBtn.disabled = false;
            stopBtn.disabled = false;
            clearStatus();
       } catch(err) {
            showStatus(`File Error: ${err.message}`);
       }
    });

    function drawStaticWaveform(buf) {
       const width = waveform.width = waveform.clientWidth * window.devicePixelRatio;
       const height = waveform.height = waveform.clientHeight * window.devicePixelRatio;
       waveform.style.width = waveform.clientWidth + "px";
       waveform.style.height = waveform.clientHeight + "px";
       const data = buf.getChannelData(0);
       const step = Math.ceil(data.length / width);
       const amp = height / 2;
       ctx.fillStyle = "#1E1E30";
       ctx.fillRect(0, 0, width, height);
       ctx.lineWidth = 1.5;
       ctx.strokeStyle = "#7C3AED";
       ctx.beginPath();
       for (let i = 0; i < width; i++) {
            let min = 1;
            let max = -1;
            for (let j = 0; j < step; j++) {
                 const d = data[i * step + j];
                 if (d < min) min = d;
                 if (d > max) max = d;
            }
            ctx.moveTo(i, (1 + min) * amp);
            ctx.lineTo(i, (1 + max) * amp);
       }
       ctx.stroke();
    }

    function drawLiveWaveform() {
       const width = waveform.width;
       const height = waveform.height;
       const len = analyser.frequencyBinCount;
       const data = new Uint8Array(len);
       function draw() {
          animationId = requestAnimationFrame(draw);
          analyser.getByteTimeDomainData(data);
          ctx.fillStyle = "#1E1E30";
          ctx.fillRect(0, 0, width, height);
          ctx.lineWidth = 2;
          ctx.strokeStyle = "#7C3AED";
          ctx.beginPath();
          const sliceW = width / len;
          let x = 0;
          for (let i = 0; i < len; i++) {
               const v = data[i] / 128.0;
               const y = v * height / 2;
               i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
               x += sliceW;
          }
          ctx.lineTo(width, height / 2);
          ctx.stroke();
          const current = audioContext.currentTime - startTime;
          timeDisplay.textContent = `${formatTime(current)} / ${formatTime(bufferDuration)}`;
       }
       draw();
    }

    function formatTime(s) {
       const m = Math.floor(s / 60);
       const sec = Math.floor(s % 60);
       return `${m.toString().padStart(2,'0')}:${sec.toString().padStart(2,'0')}`;
    }

    playBtn.addEventListener("click", async () => {
       if (!audioBuffer) return;
       if (!(await resumeContext())) {
           showStatus("Click Play again");
           return;
       }

       if (isPlaying) {
           audioSource.stop();
           cancelAnimationFrame(animationId);
           pauseTime = audioContext.currentTime - startTime;
           playBtn.innerHTML = "<i class='fa-solid fa-play'></i> Play";
           isPlaying = false;
           return;
       }

       audioSource = audioContext.createBufferSource();
       audioSource.buffer = audioBuffer;
       audioSource.connect(bassFilter);
       bassFilter.connect(trebleFilter);
       trebleFilter.connect(analyser);
       analyser.connect(gainNode);
       gainNode.connect(audioContext.destination);
       startTime = audioContext.currentTime - pauseTime;
       audioSource.start(0, pauseTime);
       drawLiveWaveform();
       audioSource.onended = () => {
            if (isPlaying) {
                cancelAnimationFrame(animationId);
                isPlaying = false;
                playBtn.innerHTML = "<i class='fa-solid fa-play'></i> Play";
                pauseTime = 0;
                timeDisplay.textContent = `${formatTime(bufferDuration)} / ${formatTime(bufferDuration)}`;
                drawStaticWaveform(audioBuffer);
            }
       };
       playBtn.innerHTML = "<i class='fa-solid fa-pause'></i> Pause";
       isPlaying = true;
       clearStatus();
    });

    stopBtn.addEventListener("click", () => {
       if (audioSource && isPlaying) audioSource.stop();
       isPlaying = false;
       pauseTime = 0;
       playBtn.innerHTML = "<i class='fa-solid fa-play'></i> Play";
       timeDisplay.textContent = `00:00 / ${formatTime(bufferDuration)}`;
       cancelAnimationFrame(animationId);
       if (audioBuffer) drawStaticWaveform(audioBuffer);
    });

    bassSlider.addEventListener("input", () => {
       const v = parseFloat(bassSlider.value);
       bassValue.textContent = `${v > 0 ? "+" : ""}${v} dB`;
       if (bassFilter) bassFilter.gain.value = v;
    });

    trebleSlider.addEventListener("input", () => {
       const v = parseFloat(trebleSlider.value);
       trebleValue.textContent = `${v > 0 ? "+" : ""}${v} dB`;
       if (trebleFilter) trebleFilter.gain.value = v;
    });
});