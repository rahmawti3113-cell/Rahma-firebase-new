import React, { useEffect, useState, useRef } from 'react';
import { ref, onValue, set, update } from 'firebase/database';
import { signOut } from 'firebase/auth';
import { db, auth } from './firebase';
import { Thermometer, Droplets, Power, LogOut, Mic, MicOff, Volume2, Activity, Sun, Moon, Lightbulb, LightbulbOff, Zap, RefreshCcw, Clock } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface IoTData {
  Suhu: number;
  Kelembapan: number;
  Relay1: boolean;
  Relay2: boolean;
  Relay3: boolean;
  Relay4: boolean;
}

interface HistoryData {
  time: string;
  suhu: number;
  kelembapan: number;
}

export default function Dashboard() {
  const [data, setData] = useState<IoTData>({
    Suhu: 0,
    Kelembapan: 0,
    Relay1: false,
    Relay2: false,
    Relay3: false,
    Relay4: false,
  });

  const [history, setHistory] = useState<HistoryData[]>([]);
  
  // Custom States for Dark Mode and Stats
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('theme') === 'dark' || (!localStorage.getItem('theme') && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });
  const [lastUpdate, setLastUpdate] = useState<string>('-');
  const [uptime, setUptime] = useState<number>(0);
  const [maxSuhu, setMaxSuhu] = useState<number>(0);
  const [maxKelembapan, setMaxKelembapan] = useState<number>(0);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  useEffect(() => {
    const start = Date.now();
    const interval = setInterval(() => {
      setUptime(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatUptime = (seconds: number) => {
    if (isNaN(seconds)) return '00:00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
  };

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [runningMode, setRunningMode] = useState<'none' | 'var1' | 'var2'>('none');
  const recognitionRef = useRef<any>(null);
  
  // To keep reference inside callbacks
  const dataRef = useRef(data);
  
  // Sync ref whenever data changes
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  // Listener Firebase Terpusat
  useEffect(() => {
    const iotRef = ref(db, 'IoT');
    const unsubscribe = onValue(iotRef, (snapshot) => {
      if (snapshot.exists()) {
        const value = snapshot.val();
        
        // Logging penerimaan data dari Firebase (mensimulasikan MQTT received log)
        console.log("[Firebase/MQTT] Menerima data payload:", value);
        
        setMaxSuhu(prev => Math.max(prev, value.Suhu || 0));
        setMaxKelembapan(prev => Math.max(prev, value.Kelembapan || 0));
        setLastUpdate(new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));

        setData({
          Suhu: value.Suhu || 0,
          Kelembapan: value.Kelembapan || 0,
          Relay1: value.Relay1 || false,
          Relay2: value.Relay2 || false,
          Relay3: value.Relay3 || false,
          Relay4: value.Relay4 || false,
        });
        
        // Perhatikan: Kita TIDAK lagi memperbarui grafik 'history' di sini.
        // Arsitektur dipisahkan: Perubahan relay tidak akan memicu grafik sensor.
      }
    });

    return () => unsubscribe();
  }, []);

  // Update Grafik interval 10 detik murni untuk Sensor DHT22
  useEffect(() => {
    const updateChart = () => {
      const currentSuhu = dataRef.current.Suhu;
      const currentKelembapan = dataRef.current.Kelembapan;
      
      // abaikan jika data belum load sepenuhnya
      if (currentSuhu === 0 && currentKelembapan === 0) return;
      
      const now = new Date();
      // Sumbu waktu dalam format HH:mm:ss yang rapi
      const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      
      setHistory(prev => {
        const newPoint = { time: timeStr, suhu: currentSuhu, kelembapan: currentKelembapan };
        const nextHistory = [...prev, newPoint];
        // Batasi maksimal 20 data terakhir agar grafik tidak terlalu rapat
        if (nextHistory.length > 20) {
          return nextHistory.slice(nextHistory.length - 20);
        }
        return nextHistory;
      });
    };

    // Eksekusi chart update setiap 10 detik
    const interval = setInterval(updateChart, 10000);
    return () => clearInterval(interval);
  }, []);

  const toggleRelay = (relayNum: number) => {
    setRunningMode('none');
    const relayKey = `Relay${relayNum}` as keyof IoTData;
    const currentState = data[relayKey];
    const targetState = !currentState;
    
    console.log(`[Command] Meminta toggle ${relayKey} -> Target Status: ${targetState ? "ON" : "OFF"}`);
    
    update(ref(db, 'IoT'), {
      [relayKey]: targetState,
      Mode: 0,
      AllOff: false
    }).then(() => {
       console.log(`[Success] Status ${relayKey} berhasil diupdate ke Firebase:`, targetState);
    });
  };

  const setAllRelays = async (state: boolean) => {
    setRunningMode('none');
    console.log(`[Command] Meminta Semua Relay -> Target Status: ${state ? "ON" : "OFF"}`);
    
    if (state) {
      // Menggunakan delay kecil antar perintah untuk menghindari payload terpotong 
      // atau tegangan drop pada ESP32 yang membuat beberapa relay gagal nyala.
      await update(ref(db, 'IoT'), { Relay1: true, Mode: 0, AllOff: false });
      await new Promise(res => setTimeout(res, 200));
      await update(ref(db, 'IoT'), { Relay2: true });
      await new Promise(res => setTimeout(res, 200));
      await update(ref(db, 'IoT'), { Relay3: true });
      await new Promise(res => setTimeout(res, 200));
      await update(ref(db, 'IoT'), { Relay4: true });
      console.log(`[Success] Semua Relay dinyalakan (ON) secara sekuensial`);
    } else {
      await update(ref(db, 'IoT'), { Relay1: false, Mode: 0, AllOff: true });
      await new Promise(res => setTimeout(res, 200));
      await update(ref(db, 'IoT'), { Relay2: false });
      await new Promise(res => setTimeout(res, 200));
      await update(ref(db, 'IoT'), { Relay3: false });
      await new Promise(res => setTimeout(res, 200));
      await update(ref(db, 'IoT'), { Relay4: false });
      console.log(`[Success] Semua Relay dimatikan (OFF) secara sekuensial`);
    }
  };

  const setVariasi = (mode: 1 | 2) => {
    setRunningMode(`var${mode}`);
    console.log(`[Command] Menjalankan variasi ${mode}`);
    update(ref(db, 'IoT'), { Mode: mode, AllOff: false });
  };

  const stopVariasi = () => {
    setRunningMode('none');
    update(ref(db, 'IoT'), { Mode: 0, AllOff: false });
  };

  const handleLogout = () => {
    signOut(auth);
  };

  const speak = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel(); // Hentikan suara yang sedang berjalan
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'id-ID'; 
      utterance.volume = 1.0;
      utterance.rate = 1.0;
      utterance.pitch = 1.2; // Pitch sedikit dinaikkan agar lebih terdengar feminin jika voice default
      
      const voices = window.speechSynthesis.getVoices();
      
      // Mencari semua suara berbahasa Indonesia
      const idVoices = voices.filter(v => v.lang.includes('id-ID') || v.lang.includes('id_ID') || v.lang === 'id');
      
      if (idVoices.length > 0) {
        // Prioritaskan "Google Bahasa Indonesia" (biasanya wanita)
        const googleVoice = idVoices.find(v => v.name.includes('Google'));
        // Hindari "Andika" (suara pria Microsoft)
        const femaleVoice = idVoices.find(v => !v.name.includes('Andika') && !v.name.includes('Male'));
        
        utterance.voice = googleVoice || femaleVoice || idVoices[0];
      }
      
      window.speechSynthesis.speak(utterance);
    } else {
      console.log("Speech Synthesis tidak didukung browser ini");
    }
  };

  // Ensure voices are loaded to pick the correct Indonesian Voice
  useEffect(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    }
  }, []);

  const setupVoiceRecognition = () => {
    if (!('webkitSpeechRecognition' in window)) {
      alert('Browser Anda tidak mendukung fitur pengenalan suara.');
      return;
    }

    const SpeechRecognition = (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'id-ID';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      const current = event.resultIndex;
      const result = event.results[current][0].transcript.toLowerCase();
      setTranscript(result);
      processCommand(result);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error', event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
  };

  useEffect(() => {
    setupVoiceRecognition();
  }, []);

  const processCommand = (command: string) => {
    // Helper function for matching multiple phrases
    const match = (phrases: string[]) => phrases.some(p => command.includes(p));

    if (match(['variasi 1', 'variasi satu'])) {
      setVariasi(1);
      speak('Menjalankan variasi satu pada relay');
    } else if (match(['variasi 2', 'variasi dua'])) {
      setVariasi(2);
      speak('Menjalankan variasi dua pada relay');
    } else if (match(['suhu', 'temperatur'])) {
      speak(`Suhu saat ini adalah ${dataRef.current.Suhu} derajat celcius`);
    } else if (match(['kelembapan', 'lembab'])) {
      speak(`Kelembapan saat ini adalah ${dataRef.current.Kelembapan} persen`);
    } else if (match(['nyalakan semua', 'hidupkan semua', 'semua relay on', 'semua on', 'hidupkan'])) {
      setAllRelays(true);
      speak('Semua relay dinyalakan');
    } else if (match(['matikan semua', 'semua relay off', 'semua off', 'matikan'])) {
      setAllRelays(false);
      speak('Semua relay dimatikan');
    } else if (match(['nyalakan relay 1', 'hidupkan relay 1', 'nyalakan relay satu', 'hidupkan relay satu', 'nyalakan satu'])) {
      setRunningMode('none');
      console.log(`[Command Suara] Meminta Relay1 -> ON`);
      update(ref(db, 'IoT'), { Relay1: true, Mode: 0, AllOff: false });
      speak('Relay satu dinyalakan');
    } else if (match(['matikan relay 1', 'matikan relay satu', 'matikan satu'])) {
      setRunningMode('none');
      console.log(`[Command Suara] Meminta Relay1 -> OFF`);
      update(ref(db, 'IoT'), { Relay1: false, Mode: 0, AllOff: false });
      speak('Relay satu dimatikan');
    } else if (match(['nyalakan relay 2', 'hidupkan relay 2', 'nyalakan relay dua', 'hidupkan relay dua', 'nyalakan dua'])) {
      setRunningMode('none');
      console.log(`[Command Suara] Meminta Relay2 -> ON`);
      update(ref(db, 'IoT'), { Relay2: true, Mode: 0, AllOff: false });
      speak('Relay dua dinyalakan');
    } else if (match(['matikan relay 2', 'matikan relay dua', 'matikan dua'])) {
      setRunningMode('none');
      console.log(`[Command Suara] Meminta Relay2 -> OFF`);
      update(ref(db, 'IoT'), { Relay2: false, Mode: 0, AllOff: false });
      speak('Relay dua dimatikan');
    } else if (match(['nyalakan relay 3', 'hidupkan relay 3', 'nyalakan relay tiga', 'hidupkan relay tiga', 'nyalakan tiga'])) {
      setRunningMode('none');
      console.log(`[Command Suara] Meminta Relay3 -> ON`);
      update(ref(db, 'IoT'), { Relay3: true, Mode: 0, AllOff: false });
      speak('Relay tiga dinyalakan');
    } else if (match(['matikan relay 3', 'matikan relay tiga', 'matikan tiga'])) {
      setRunningMode('none');
      console.log(`[Command Suara] Meminta Relay3 -> OFF`);
      update(ref(db, 'IoT'), { Relay3: false, Mode: 0, AllOff: false });
      speak('Relay tiga dimatikan');
    } else if (match(['nyalakan relay 4', 'hidupkan relay 4', 'nyalakan relay empat', 'hidupkan relay empat', 'nyalakan empat'])) {
      setRunningMode('none');
      console.log(`[Command Suara] Meminta Relay4 -> ON`);
      update(ref(db, 'IoT'), { Relay4: true, Mode: 0, AllOff: false });
      speak('Relay empat dinyalakan');
    } else if (match(['matikan relay 4', 'matikan relay empat', 'matikan empat'])) {
      setRunningMode('none');
      console.log(`[Command Suara] Meminta Relay4 -> OFF`);
      update(ref(db, 'IoT'), { Relay4: false, Mode: 0, AllOff: false });
      speak('Relay empat dimatikan');
    } else {
      speak('Perintah tidak dikenali');
    }
  };

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      recognitionRef.current?.start();
    }
  };

  return (
    <div className={`h-screen flex flex-col overflow-hidden font-sans transition-colors duration-300 ${darkMode ? 'bg-[#0f172a] text-[#f8fafc]' : 'bg-[#FFF5F8] text-[#333333]'}`}>
      {/* Header */}
      <header className={`px-6 py-5 md:px-10 backdrop-blur-md border-b flex justify-between items-center shrink-0 transition-colors ${darkMode ? 'bg-[#0f172a]/80 border-[#1f2937]' : 'bg-[#FFF5F8]/80 border-[#F8D7E5]'}`}>
        <div className="flex items-center">
          <span className="font-[900] tracking-wide text-[22px] md:text-[24px] bg-[linear-gradient(135deg,#ff5ca8,#ff8ac6,#ff9ed1)] bg-clip-text text-transparent drop-shadow-[0_0_8px_rgba(255,92,168,0.15)] transition-all duration-300 hover:scale-[1.03] hover:drop-shadow-[0_0_12px_rgba(255,92,168,0.4)] cursor-default">RAHMA</span>
          <span className={`font-light ml-2 uppercase text-sm hidden sm:inline-block transition-colors ${darkMode ? 'text-[#94a3b8]' : 'text-[#666666]'}`}>IoT Dashboard</span>
        </div>
        <div className="flex items-center gap-4 sm:gap-6 text-sm">
          <div className={`hidden sm:flex items-center gap-2 font-medium transition-colors ${darkMode ? 'text-[#94a3b8]' : 'text-[#666666]'}`}>
             <div className="w-2 h-2 bg-[#22c55e] rounded-full shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
             Firebase Connected
          </div>
          
          <button
            onClick={() => setDarkMode(!darkMode)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full transition-colors border ${darkMode ? 'bg-[#1f2937] border-[#374151] hover:bg-[#374151] text-yellow-400' : 'bg-white border-[#F8D7E5] hover:bg-[#FFF5F8] text-[#FF69B4]'}`}
          >
            {darkMode ? <Moon size={16} /> : <Sun size={16} />}
            <span className="text-xs font-semibold hidden sm:block">{darkMode ? 'Dark' : 'Light'}</span>
          </button>

          <button
            onClick={handleLogout}
            className={`transition-colors flex items-center gap-2 ${darkMode ? 'text-[#94a3b8] hover:text-[#f8fafc]' : 'text-[#666666] hover:text-[#333333]'}`}
            title="Logout"
          >
            <LogOut size={18} />
            <span className="hidden sm:inline-block text-xs font-semibold">LOGOUT</span>
          </button>
        </div>
      </header>

      {/* Main Panel */}
      <main className={`flex-1 overflow-y-auto p-6 md:p-10 flex flex-col gap-8 transition-colors ${darkMode ? 'bg-[radial-gradient(circle_at_top_right,rgba(255,105,180,0.03),transparent)]' : 'bg-[radial-gradient(circle_at_top_right,rgba(255,105,180,0.05),transparent)]'}`}>
        
        {/* Sensors Grid */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto w-full">
          {/* Temperature */}
          <div className={`${darkMode ? 'bg-[#111827] border-[#1f2937]' : 'bg-[#FFFFFF] border-[#F8D7E5]'} border rounded-2xl p-6 relative shadow flex items-center gap-5 transition-colors`}>
            <div className={`w-[70px] h-[70px] rounded-[20px] flex items-center justify-center shrink-0 transition-colors ${darkMode ? 'bg-gradient-to-br from-pink-500/20 to-red-500/10 text-pink-500 shadow-[inset_0_0_20px_rgba(255,105,180,0.1)]' : 'bg-[#FFF5F8] text-pink-400'}`}>
              <Thermometer size={34} strokeWidth={1.5} />
            </div>
            <div className="flex-1">
              <div className="flex justify-between items-center mb-1">
                <div className={`text-sm transition-colors ${darkMode ? 'text-[#94a3b8]' : 'text-[#666666]'}`}>Suhu Ruangan</div>
                <div className="px-2.5 py-1 rounded-full text-[10px] bg-[#22c55e]/10 text-[#22c55e] flex items-center gap-1.5 font-semibold">
                  <div className="w-1.5 h-1.5 bg-[#22c55e] rounded-full"></div> Normal
                </div>
              </div>
              <div className="flex items-baseline mt-1">
                <span className="text-[48px] font-bold leading-none bg-gradient-to-br from-[#ff5ca8] to-[#ff8ac6] bg-clip-text text-transparent">
                  {parseFloat(data.Suhu.toString()).toFixed(1)}
                </span>
                <span className={`text-xl ml-2 font-medium transition-colors ${darkMode ? 'text-[#94a3b8]' : 'text-[#666666]'}`}>°C</span>
              </div>
              <div className={`mt-1.5 text-[11px] transition-colors ${darkMode ? 'text-[#64748b]' : 'text-[#999999]'}`}>Update dari Firebase</div>
            </div>
          </div>

          {/* Humidity */}
          <div className={`${darkMode ? 'bg-[#111827] border-[#1f2937]' : 'bg-[#FFFFFF] border-[#F8D7E5]'} border rounded-2xl p-6 relative shadow flex items-center gap-5 transition-colors`}>
            <div className={`w-[70px] h-[70px] rounded-[20px] flex items-center justify-center shrink-0 transition-colors ${darkMode ? 'bg-gradient-to-br from-blue-500/20 to-cyan-500/10 text-blue-500 shadow-[inset_0_0_20px_rgba(59,130,246,0.1)]' : 'bg-blue-50 text-blue-400'}`}>
              <Droplets size={34} strokeWidth={1.5} />
            </div>
            <div className="flex-1">
              <div className="flex justify-between items-center mb-1">
                <div className={`text-sm transition-colors ${darkMode ? 'text-[#94a3b8]' : 'text-[#666666]'}`}>Kelembapan</div>
                <div className="px-2.5 py-1 rounded-full text-[10px] bg-[#3b82f6]/10 text-[#3b82f6] flex items-center gap-1.5 font-semibold">
                  <div className="w-1.5 h-1.5 bg-[#3b82f6] rounded-full"></div> Ideal
                </div>
              </div>
              <div className="flex items-baseline mt-1">
                <span className="text-[48px] font-bold leading-none bg-gradient-to-br from-[#3b82f6] to-[#818cf8] bg-clip-text text-transparent">
                  {parseFloat(data.Kelembapan.toString()).toFixed(1)}
                </span>
                <span className={`text-xl ml-2 font-medium transition-colors ${darkMode ? 'text-[#94a3b8]' : 'text-[#666666]'}`}>%</span>
              </div>
              <div className={`mt-1.5 text-[11px] transition-colors ${darkMode ? 'text-[#64748b]' : 'text-[#999999]'}`}>Sensor DHT22</div>
            </div>
          </div>
        </section>

        {/* Charts Section */}
        <section className="max-w-5xl mx-auto w-full">
          <div className={`flex items-center gap-2 m-0 mb-5 text-lg font-semibold transition-colors ${darkMode ? 'text-[#f8fafc]' : 'text-[#666666]'}`}>
             <Activity className={darkMode ? 'text-pink-400' : 'text-pink-500'} size={20} />
             Grafik Monitoring Realtime
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Suhu Chart */}
            <div className={`${darkMode ? 'bg-[#111827] border-[#1f2937]' : 'bg-[#FFFFFF] border-[#F8D7E5]'} border rounded-2xl p-6 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05)] transition-colors`}>
              <h4 className={`text-sm font-semibold mb-4 transition-colors ${darkMode ? 'text-[#f8fafc]' : 'text-[#666666]'}`}>Suhu Realtime (°C)</h4>
              <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={history}>
                    <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#374151' : '#F8D7E5'} />
                    <XAxis dataKey="time" stroke={darkMode ? '#94a3b8' : '#FFB6C1'} fontSize={11} tickFormatter={(val) => val} minTickGap={30} tickCount={5} />
                    <YAxis stroke={darkMode ? '#94a3b8' : '#FFB6C1'} fontSize={11} domain={['auto', 'auto']} />
                    <Tooltip labelFormatter={(label) => `Waktu: ${label}`} contentStyle={{ backgroundColor: darkMode ? '#1f2937' : '#FFF5F8', borderRadius: '8px', border: `1px solid ${darkMode ? '#374151' : '#F8D7E5'}`, color: darkMode ? '#f8fafc' : '#333333' }} />
                    <Line type="monotone" dataKey="suhu" stroke="#FF69B4" strokeWidth={3} dot={{ r: 3, fill: '#FF69B4' }} activeDot={{ r: 6 }} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Kelembapan Chart */}
            <div className={`${darkMode ? 'bg-[#111827] border-[#1f2937]' : 'bg-[#FFFFFF] border-[#F8D7E5]'} border rounded-2xl p-6 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05)] transition-colors`}>
              <h4 className={`text-sm font-semibold mb-4 transition-colors ${darkMode ? 'text-[#f8fafc]' : 'text-[#666666]'}`}>Kelembapan Realtime (%)</h4>
              <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={history}>
                    <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#374151' : '#F8D7E5'} />
                    <XAxis dataKey="time" stroke={darkMode ? '#94a3b8' : '#FFB6C1'} fontSize={11} tickFormatter={(val) => val} minTickGap={30} tickCount={5} />
                    <YAxis stroke={darkMode ? '#94a3b8' : '#FFB6C1'} fontSize={11} domain={['auto', 'auto']} />
                    <Tooltip labelFormatter={(label) => `Waktu: ${label}`} contentStyle={{ backgroundColor: darkMode ? '#1f2937' : '#FFF5F8', borderRadius: '8px', border: `1px solid ${darkMode ? '#374151' : '#F8D7E5'}`, color: darkMode ? '#f8fafc' : '#333333' }} />
                    <Line type="monotone" dataKey="kelembapan" stroke="#38bdf8" strokeWidth={3} dot={{ r: 3, fill: '#38bdf8' }} activeDot={{ r: 6 }} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </section>

        {/* Relays Section */}
        <section className="max-w-5xl mx-auto w-full">
          <div className={`flex items-center gap-2 m-0 mb-5 text-lg font-semibold transition-colors ${darkMode ? 'text-[#f8fafc]' : 'text-[#666666]'}`}>
             <Zap className={darkMode ? 'text-pink-400' : 'text-pink-500'} size={20} />
             Kontrol Relay Digital
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {[1, 2, 3, 4].map((num) => {
              const isOn = data[`Relay${num}` as keyof IoTData];
              const deviceName = `Relay ${num}`;
              
              const cardBg = darkMode ? 'bg-[#111827]' : 'bg-[#FFFFFF]';
              const cardBorder = darkMode ? 'border-[#1f2937]' : 'border-[#F8D7E5]';
              const textPrimary = darkMode ? 'text-[#f8fafc]' : 'text-[#333333]';
              const textSecondary = darkMode ? 'text-[#94a3b8]' : 'text-[#666666]';
              const hoverBorder = darkMode ? 'hover:border-[#374151]' : 'hover:border-[#FFB6C1]';
              
              const activeGlow = isOn ? 'shadow-[0_0_15px_rgba(34,197,94,0.15)] md:shadow-[0_0_20px_rgba(34,197,94,0.2)] border-[#22c55e]/50' : cardBorder;
              const runningStyle = runningMode !== 'none' ? `opacity-80 ${darkMode ? 'bg-[#111827]/50' : 'bg-[#FFFFFF]/50'}` : hoverBorder;
              
              return (
                <div 
                  key={num}
                  onClick={() => toggleRelay(num)}
                  className={`border rounded-2xl p-6 flex items-center justify-between cursor-pointer hover:-translate-y-1 transition-all group ${cardBg} ${activeGlow} ${runningStyle}`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-[48px] h-[48px] rounded-full flex items-center justify-center shrink-0 transition-colors ${isOn ? 'bg-[#22c55e]/10 text-[#22c55e]' : (darkMode ? 'bg-[#1f2937] text-[#64748b]' : 'bg-[#f1f5f9] text-[#94a3b8]')}`}>
                      {isOn ? <Lightbulb size={24} strokeWidth={2} /> : <LightbulbOff size={24} strokeWidth={1.5} />}
                    </div>
                    
                    <div>
                      <div className={`font-semibold text-base transition-colors ${textPrimary}`}>{deviceName}</div>
                      <div className={`text-xs mt-1 flex items-center gap-1.5 transition-colors ${isOn ? 'text-[#22c55e]' : textSecondary}`}>
                        {isOn && <div className="w-1.5 h-1.5 bg-[#22c55e] rounded-full shadow-[0_0_5px_rgba(34,197,94,0.8)]"></div>}
                        {isOn ? 'Aktif (ON)' : 'Standby (OFF)'}
                      </div>
                    </div>
                  </div>
                  
                  <div className={`w-[44px] h-[24px] rounded-full relative transition-colors duration-300 ${isOn ? 'bg-[#22c55e]' : (darkMode ? 'bg-[#374151]' : 'bg-[#E2E8F0]')}`}>
                    <div className={`w-5 h-5 rounded-full absolute top-[2px] transition-all duration-300 shadow-sm ${isOn ? 'left-[22px] bg-white' : (darkMode ? 'left-[2px] bg-[#94a3b8]' : 'left-[2px] bg-white')}`} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quick Actions / Variations */}
          <div className="mt-8">
            <h3 className={`flex items-center gap-2 m-0 mb-4 text-sm font-semibold uppercase tracking-wider transition-colors ${darkMode ? 'text-[#f8fafc]' : 'text-[#666666]'}`}>
              <Activity size={16} /> Aksi Cepat & Variasi
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm font-medium">
              <button 
                onClick={() => setVariasi(1)}
                className={`py-3 px-4 rounded-xl transition-all border ${runningMode === 'var1' ? 'bg-gradient-to-r from-[#ff5ca8] to-[#ff8ac6] text-[#FFFFFF] border-transparent shadow-[0_0_15px_rgba(255,105,180,0.3)]' : (darkMode ? 'bg-[#111827] text-[#94a3b8] border-[#1f2937] hover:bg-[#1f2937]' : 'bg-[#FFFFFF] text-[#333333] border-[#F8D7E5] hover:bg-[#FFF5F8]')}`}
              >
                <div className="flex items-center justify-center gap-2">
                  <RefreshCcw size={16} className={runningMode === 'var1' ? 'animate-spin' : ''} /> Variasi 1 (1➔4)
                </div>
              </button>
              <button 
                onClick={() => setVariasi(2)}
                className={`py-3 px-4 rounded-xl transition-all border ${runningMode === 'var2' ? 'bg-gradient-to-r from-[#8b5cf6] to-[#c084fc] text-[#FFFFFF] border-transparent shadow-[0_0_15px_rgba(139,92,246,0.3)]' : (darkMode ? 'bg-[#111827] text-[#94a3b8] border-[#1f2937] hover:bg-[#1f2937]' : 'bg-[#FFFFFF] text-[#333333] border-[#F8D7E5] hover:bg-[#FFF5F8]')}`}
              >
                <div className="flex items-center justify-center gap-2">
                  <RefreshCcw size={16} className={runningMode === 'var2' ? 'animate-spin' : ''} /> Variasi 2 (4➔1)
                </div>
              </button>
              <button 
                onClick={() => setAllRelays(true)}
                className={`py-3 px-4 rounded-xl transition-all border ${darkMode ? 'bg-[#111827] text-[#22c55e] border-[#1f2937] hover:bg-[#22c55e]/10 hover:border-[#22c55e]/30' : 'bg-[#FFFFFF] text-[#22c55e] border-[#F8D7E5] hover:bg-[#22c55e]/10 hover:border-[#22c55e]/30'}`}
              >
                <div className="flex items-center justify-center gap-2">
                  <Zap size={16} /> Semua ON
                </div>
              </button>
              <button 
                onClick={() => setAllRelays(false)}
                className={`py-3 px-4 rounded-xl transition-all border ${darkMode ? 'bg-[#111827] text-[#ef4444] border-[#1f2937] hover:bg-[#ef4444]/10 hover:border-[#ef4444]/30' : 'bg-[#FFFFFF] text-[#ef4444] border-[#F8D7E5] hover:bg-[#ef4444]/10 hover:border-[#ef4444]/30'}`}
              >
                <div className="flex items-center justify-center gap-2">
                  <Power size={16} /> Semua OFF
                </div>
              </button>
            </div>
            {runningMode !== 'none' && (
              <div className="mt-4 text-center">
                <button 
                  onClick={stopVariasi}
                  className="py-1 px-4 text-xs tracking-wider rounded-full bg-[#FFB6C1] text-[#333333] hover:bg-[#FF69B4] hover:text-white transition-all font-semibold"
                >
                  HENTIKAN VARIASI AKTIF
                </button>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Footer / Voice Bar */}
      <div className={`border-t px-6 py-4 md:px-10 flex flex-col shrink-0 w-full shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] transition-colors ${darkMode ? 'bg-[#111827] border-[#1f2937]' : 'bg-[#FFFFFF] border-[#F8D7E5]'}`}>
        {/* Voice control portion */}
        <div className="flex flex-col md:flex-row items-center gap-5">
          <button 
            onClick={toggleListening}
            className={`w-12 h-12 rounded-full border-none flex items-center justify-center shrink-0 transition-all ${
              isListening 
                ? 'bg-[#ef4444] text-white animate-glow-pulse shadow-[0_0_15px_rgba(239,68,68,0.5)]' 
                : 'bg-gradient-to-br from-[#ff5ca8] to-[#ff8ac6] text-white shadow-[0_0_15px_rgba(255,105,180,0.3)] hover:scale-105'
            }`}
          >
            {isListening ? <MicOff size={24} /> : <Mic size={24} />}
          </button>
          
          <div className="flex-1 text-center md:text-left">
            <div className={`text-[12px] font-bold mb-1 tracking-wide transition-colors ${isListening ? 'text-[#ef4444]' : (darkMode ? 'text-pink-400' : 'text-[#FF69B4]')}`}>
              {isListening ? 'MENDENGARKAN...' : 'KONTROL SUARA AKTIF'}
            </div>
            <div className={`text-base opacity-90 font-medium italic min-h-[24px] transition-colors ${darkMode ? 'text-[#94a3b8]' : 'text-[#666666]'}`}>
              {transcript ? `"${transcript}"` : '"Tekan mic untuk memberi perintah"'}
            </div>
          </div>
          
          <div className="flex flex-wrap justify-center md:justify-end gap-2.5">
            <span className={`text-[11px] py-1 px-2.5 rounded border font-medium transition-colors ${darkMode ? 'bg-[#1f2937] border-[#374151] text-[#94a3b8]' : 'bg-[#FFF5F8] border-[#F8D7E5] text-[#333333]'}`}>"Berapa suhu?"</span>
            <span className={`text-[11px] py-1 px-2.5 rounded border font-medium transition-colors ${darkMode ? 'bg-[#1f2937] border-[#374151] text-[#94a3b8]' : 'bg-[#FFF5F8] border-[#F8D7E5] text-[#333333]'}`}>"Hidupkan relay 1"</span>
            <span className={`text-[11px] py-1 px-2.5 rounded border font-medium transition-colors ${darkMode ? 'bg-[#1f2937] border-[#374151] text-[#94a3b8]' : 'bg-[#FFF5F8] border-[#F8D7E5] text-[#333333]'}`}>"Matikan semua relay"</span>
          </div>
        </div>

        {/* Stats portion */}
        <div className={`mt-5 pt-4 border-t flex flex-row flex-nowrap md:grid md:grid-cols-5 gap-3 overflow-x-auto [&::-webkit-scrollbar]:hidden pb-1 transition-colors ${darkMode ? 'border-[#1f2937]' : 'border-[#F8D7E5]'}`}>
          {/* Relay Aktif */}
          <div className="flex items-center gap-3 p-0 min-w-[140px] shrink-0">
            <div className={`p-2.5 rounded-xl transition-colors ${darkMode ? 'bg-red-500/10 text-red-500' : 'bg-red-100 text-red-500'}`}><Zap size={18} /></div>
            <div>
              <div className={`text-[10px] uppercase font-bold tracking-wider transition-colors ${darkMode ? 'text-[#64748b]' : 'text-[#666666]'}`}>Relay Aktif</div>
              <div className={`text-sm font-bold mt-0.5 transition-colors ${darkMode ? 'text-[#f8fafc]' : 'text-[#333333]'}`}>
                {[data.Relay1, data.Relay2, data.Relay3, data.Relay4].filter(Boolean).length} / 4
              </div>
            </div>
          </div>
          {/* Suhu Tertinggi */}
          <div className="flex items-center gap-3 p-0 min-w-[140px] shrink-0">
            <div className={`p-2.5 rounded-xl transition-colors ${darkMode ? 'bg-orange-500/10 text-orange-500' : 'bg-orange-100 text-orange-500'}`}><Thermometer size={18} /></div>
            <div>
              <div className={`text-[10px] uppercase font-bold tracking-wider transition-colors ${darkMode ? 'text-[#64748b]' : 'text-[#666666]'}`}>Suhu Tertinggi</div>
              <div className={`text-sm font-bold mt-0.5 transition-colors ${darkMode ? 'text-[#f8fafc]' : 'text-[#333333]'}`}>{maxSuhu.toFixed(1)} <span className="text-[10px] font-normal">°C</span></div>
            </div>
          </div>
          {/* Kelembapan Tertinggi */}
          <div className="flex items-center gap-3 p-0 min-w-[140px] shrink-0">
            <div className={`p-2.5 rounded-xl transition-colors ${darkMode ? 'bg-blue-500/10 text-blue-500' : 'bg-blue-100 text-blue-500'}`}><Droplets size={18} /></div>
            <div>
              <div className={`text-[10px] uppercase font-bold tracking-wider transition-colors ${darkMode ? 'text-[#64748b]' : 'text-[#666666]'}`}>Kelembapan Max</div>
              <div className={`text-sm font-bold mt-0.5 transition-colors ${darkMode ? 'text-[#f8fafc]' : 'text-[#333333]'}`}>{maxKelembapan.toFixed(1)} <span className="text-[10px] font-normal">%</span></div>
            </div>
          </div>
          {/* Uptime Sistem */}
          <div className="flex items-center gap-3 p-0 min-w-[140px] shrink-0">
            <div className={`p-2.5 rounded-xl transition-colors ${darkMode ? 'bg-green-500/10 text-green-500' : 'bg-green-100 text-green-500'}`}><Clock size={18} /></div>
            <div>
              <div className={`text-[10px] uppercase font-bold tracking-wider transition-colors ${darkMode ? 'text-[#64748b]' : 'text-[#666666]'}`}>Uptime Sistem</div>
              <div className={`text-sm font-bold mt-0.5 transition-colors ${darkMode ? 'text-[#f8fafc]' : 'text-[#333333]'}`}>{formatUptime(uptime)}</div>
            </div>
          </div>
          {/* Terakhir Update */}
          <div className="flex items-center gap-3 p-0 min-w-[140px] shrink-0">
            <div className={`p-2.5 rounded-xl transition-colors ${darkMode ? 'bg-indigo-500/10 text-indigo-500' : 'bg-indigo-100 text-indigo-500'}`}><RefreshCcw size={18} /></div>
            <div>
              <div className={`text-[10px] uppercase font-bold tracking-wider transition-colors ${darkMode ? 'text-[#64748b]' : 'text-[#666666]'}`}>Terakhir Update</div>
              <div className={`text-sm font-bold mt-0.5 transition-colors ${darkMode ? 'text-[#f8fafc]' : 'text-[#333333]'}`}>{lastUpdate}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
