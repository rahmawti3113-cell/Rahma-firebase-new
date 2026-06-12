import React, { useState } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from './firebase';
import { LogIn, KeyRound } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isLogin, setIsLogin] = useState(true);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      if (err.code === 'auth/invalid-credential') {
        setError('Email atau password salah, atau akun belum terdaftar.');
      } else if (err.code === 'auth/email-already-in-use') {
        setError('Email ini sudah terdaftar. Silakan Sign In.');
      } else {
        setError(err.message || 'Authentication failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      setError(err.message || 'Failed to sign in with Google');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFF5F8] text-[#333333] flex items-center justify-center p-4 font-sans">
      <div className="bg-[#FFFFFF] p-8 rounded-2xl shadow-xl w-full max-w-md border border-[#F8D7E5]">
        <div className="text-center mb-8">
          <div className="bg-[#FFB6C1]/20 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <KeyRound className="text-[#FF69B4] w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-[#333333]">IoT Smart Dashboard</h1>
          <p className="text-[#666666] mt-2">Sign in to control your devices</p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-3 rounded-lg text-sm mb-6 text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleEmailAuth} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-[#333333] mb-2">Email</label>
            <input
              type="email"
              required
              className="w-full bg-white border border-[#F8D7E5] rounded-lg px-4 py-3 text-[#333333] focus:outline-none focus:ring-2 focus:ring-[#FFB6C1] box-border"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@domain.com"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-[#333333] mb-2">Password</label>
            <input
              type="password"
              required
              className="w-full bg-white border border-[#F8D7E5] rounded-lg px-4 py-3 text-[#333333] focus:outline-none focus:ring-2 focus:ring-[#FFB6C1] box-border"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#FF69B4] text-white font-bold py-3 mt-2 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-[#FF69B4]/90 cursor-pointer"
          >
            <LogIn className="w-5 h-5" />
            {isLogin ? 'Sign In' : 'Sign Up'}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button 
            type="button" 
            onClick={() => setIsLogin(!isLogin)} 
            className="text-[#FF69B4] text-sm font-medium hover:underline cursor-pointer"
          >
            {isLogin ? 'Belum punya akun? Daftar di sini' : 'Sudah punya akun? Masuk di sini'}
          </button>
        </div>

        <div className="mt-6 flex items-center gap-3 text-[#666666]">
          <div className="h-px bg-[#F8D7E5] flex-1"></div>
          <span className="text-xs">Atau masuk melalui</span>
          <div className="h-px bg-[#F8D7E5] flex-1"></div>
        </div>

        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full mt-6 bg-white hover:bg-[#FFF5F8] border border-[#F8D7E5] text-[#333333] font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2.5 disabled:opacity-50 cursor-pointer text-[13px]"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Sign in with Google
        </button>
      </div>
    </div>
  );
}
