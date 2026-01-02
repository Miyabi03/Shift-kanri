import React, { useState, useEffect } from 'react';

// Supabase設定
const SUPABASE_URL = 'https://uqhakbpphjgjnrdzlbju.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxaGFrYnBwaGpnam5yZHpsYmp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjczMDEwMjcsImV4cCI6MjA4Mjg3NzAyN30.Pg7ld7idJa0nxR0AA1dxPifa-NkbA8DYPXsVaMJO-Eo';

// Supabase REST API ヘルパー
const supabaseRequest = async (table, method = 'GET', body = null, query = '', token = null) => {
  const url = `${SUPABASE_URL}/rest/v1/${table}${query}`;
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${token || SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': method === 'POST' ? 'return=representation' : 'return=minimal'
  };
  
  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);
  
  const response = await fetch(url, options);
  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }
  if (method === 'GET' || method === 'POST') {
    return response.json();
  }
  return null;
};

// Supabase Auth ヘルパー
const supabaseAuth = {
  signInWithGoogle: async () => {
    const redirectUrl = window.location.origin;
    window.location.href = `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${redirectUrl}`;
  },
  
  getSession: async () => {
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const accessToken = hashParams.get('access_token');
    
    if (accessToken) {
      localStorage.setItem('supabase_token', accessToken);
      window.history.replaceState({}, document.title, window.location.pathname);
      return { access_token: accessToken };
    }
    
    const storedToken = localStorage.getItem('supabase_token');
    if (storedToken) {
      return { access_token: storedToken };
    }
    
    return null;
  },
  
  getUser: async (accessToken) => {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'apikey': SUPABASE_KEY
      }
    });
    if (!response.ok) return null;
    return response.json();
  },
  
  signOut: () => {
    localStorage.removeItem('supabase_token');
    window.location.reload();
  }
};

function App() {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [myStaffId, setMyStaffId] = useState(null);
  
  const [staff, setStaff] = useState([]);
  const [shifts, setShifts] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState('');
  const [newStaff, setNewStaff] = useState({ staff_id: '', name: '', line_name: '', email: '' });
  const [error, setError] = useState(null);
  
  // 管理者として許可されたメールアドレス（これ以外は管理者になれない）
  const ALLOWED_ADMIN_EMAIL = 'mixssq@gmail.com';

  const generateDates = () => {
    const dates = [];
    const today = new Date();
    for (let i = 0; i < 14; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      dates.push(date);
    }
    return dates;
  };

  const [dates] = useState(generateDates());
  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];

  const formatDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  useEffect(() => {
    initAuth();
  }, []);

  const initAuth = async () => {
    setIsLoading(true);
    try {
      const session = await supabaseAuth.getSession();
      if (session?.access_token) {
        setSession(session);
        const userData = await supabaseAuth.getUser(session.access_token);
        if (userData) {
          setUser(userData);
          await checkUserRole(userData.email, session.access_token);
        }
      }
      await loadData();
    } catch (err) {
      console.error('初期化エラー:', err);
      setError('初期化に失敗しました');
    }
    setIsLoading(false);
  };

  const checkUserRole = async (email, token) => {
    try {
      // 固定の管理者メールアドレスかチェック
      if (email === ALLOWED_ADMIN_EMAIL) {
        setIsAdmin(true);
        // adminsテーブルにも登録（まだなければ）
        try {
          await supabaseRequest('admins', 'POST', { email: email });
        } catch (e) {
          // 既に登録済みの場合はエラーを無視
        }
      }
      
      // 自分のスタッフIDを取得
      const myStaff = await supabaseRequest('staff', 'GET', null, `?email=eq.${email}`, token);
      if (myStaff && myStaff.length > 0) {
        setMyStaffId(myStaff[0].id);
      }
    } catch (err) {
      console.error('権限チェックエラー:', err);
    }
  };

  const loadData = async () => {
    try {
      await Promise.all([loadStaff(), loadShifts()]);
    } catch (err) {
      setError('データの読み込みに失敗しました: ' + err.message);
    }
  };

  const loadStaff = async () => {
    const data = await supabaseRequest('staff', 'GET', null, '?order=id.asc');
    setStaff(data || []);
  };

  const loadShifts = async () => {
    const data = await supabaseRequest('shifts', 'GET', null, '?select=*');
    const shiftsObj = {};
    (data || []).forEach(shift => {
      const key = `${shift.staff_id}_${shift.shift_date}`;
      shiftsObj[key] = {
        id: shift.id,
        start: shift.is_off ? 'OFF' : shift.start_time,
        end: shift.is_off ? 'OFF' : shift.end_time,
        is_off: shift.is_off,
        note: shift.note
      };
    });
    setShifts(shiftsObj);
  };

  const timeOptions = [];
  for (let h = 0; h <= 24; h++) {
    timeOptions.push(`${h}:00`);
    if (h < 24) timeOptions.push(`${h}:30`);
  }

  const getShiftKey = (staffId, date) => `${staffId}_${formatDate(date)}`;

  const canEdit = (staffDbId) => {
    if (!user) return false;
    if (isAdmin) return true;
    return staffDbId === myStaffId;
  };

  const updateShift = async (staffId, date, field, value) => {
    if (!canEdit(staffId)) {
      alert('自分のシフトのみ編集できます');
      return;
    }
    
    const dateStr = formatDate(date);
    const key = getShiftKey(staffId, date);
    const currentShift = shifts[key] || {};
    
    setSaveStatus('保存中...');
    
    try {
      const newStart = field === 'start' ? value : (currentShift.start || null);
      const newEnd = field === 'end' ? value : (currentShift.end || null);
      
      if (currentShift.id) {
        await supabaseRequest('shifts', 'PATCH', {
          start_time: newStart,
          end_time: newEnd,
          is_off: false,
          updated_at: new Date().toISOString()
        }, `?id=eq.${currentShift.id}`);
      } else {
        await supabaseRequest('shifts', 'POST', {
          staff_id: staffId,
          shift_date: dateStr,
          start_time: newStart,
          end_time: newEnd,
          is_off: false
        });
      }
      
      await loadShifts();
      setSaveStatus('✓ 保存完了');
      setTimeout(() => setSaveStatus(''), 2000);
    } catch (err) {
      console.error('シフト更新エラー:', err);
      setSaveStatus('⚠ 保存失敗');
      setTimeout(() => setSaveStatus(''), 3000);
    }
  };

  const setOff = async (staffId, date) => {
    if (!canEdit(staffId)) {
      alert('自分のシフトのみ編集できます');
      return;
    }
    
    const dateStr = formatDate(date);
    const key = getShiftKey(staffId, date);
    const currentShift = shifts[key] || {};
    
    setSaveStatus('保存中...');
    
    try {
      if (currentShift.id) {
        await supabaseRequest('shifts', 'PATCH', {
          is_off: true,
          start_time: null,
          end_time: null,
          updated_at: new Date().toISOString()
        }, `?id=eq.${currentShift.id}`);
      } else {
        await supabaseRequest('shifts', 'POST', {
          staff_id: staffId,
          shift_date: dateStr,
          is_off: true
        });
      }
      
      await loadShifts();
      setSaveStatus('✓ 保存完了');
      setTimeout(() => setSaveStatus(''), 2000);
    } catch (err) {
      console.error('OFF設定エラー:', err);
      setSaveStatus('⚠ 保存失敗');
      setTimeout(() => setSaveStatus(''), 3000);
    }
  };

  const clearShift = async (staffId, date) => {
    if (!canEdit(staffId)) {
      alert('自分のシフトのみ編集できます');
      return;
    }
    
    const key = getShiftKey(staffId, date);
    const currentShift = shifts[key];
    
    if (!currentShift?.id) return;
    
    setSaveStatus('保存中...');
    
    try {
      await supabaseRequest('shifts', 'DELETE', null, `?id=eq.${currentShift.id}`);
      await loadShifts();
      setSaveStatus('✓ 削除完了');
      setTimeout(() => setSaveStatus(''), 2000);
    } catch (err) {
      console.error('シフト削除エラー:', err);
      setSaveStatus('⚠ 削除失敗');
      setTimeout(() => setSaveStatus(''), 3000);
    }
  };

  const addStaff = async () => {
    if (!isAdmin) {
      alert('管理者のみスタッフを追加できます');
      return;
    }
    
    if (!newStaff.staff_id || !newStaff.name || !newStaff.email) {
      alert('ID、本名、メールアドレスは必須です');
      return;
    }
    
    setSaveStatus('保存中...');
    
    try {
      await supabaseRequest('staff', 'POST', {
        staff_id: newStaff.staff_id,
        name: newStaff.name,
        line_name: newStaff.line_name || null,
        email: newStaff.email
      });
      
      setNewStaff({ staff_id: '', name: '', line_name: '', email: '' });
      await loadStaff();
      setSaveStatus('✓ スタッフ追加完了');
      setTimeout(() => setSaveStatus(''), 2000);
    } catch (err) {
      console.error('スタッフ追加エラー:', err);
      if (err.message.includes('duplicate')) {
        alert('このIDまたはメールアドレスは既に使用されています');
      }
      setSaveStatus('⚠ 追加失敗');
      setTimeout(() => setSaveStatus(''), 3000);
    }
  };

  const removeStaff = async (id) => {
    if (!isAdmin) {
      alert('管理者のみスタッフを削除できます');
      return;
    }
    
    if (!confirm('このスタッフを削除しますか？')) return;
    
    setSaveStatus('削除中...');
    
    try {
      await supabaseRequest('shifts', 'DELETE', null, `?staff_id=eq.${id}`);
      await supabaseRequest('staff', 'DELETE', null, `?id=eq.${id}`);
      await loadData();
      setSaveStatus('✓ 削除完了');
      setTimeout(() => setSaveStatus(''), 2000);
    } catch (err) {
      console.error('スタッフ削除エラー:', err);
      setSaveStatus('⚠ 削除失敗');
      setTimeout(() => setSaveStatus(''), 3000);
    }
  };

  const headerStyle = {
    padding: '12px 8px',
    textAlign: 'center',
    borderBottom: '2px solid #ddd',
    fontWeight: '600',
    color: '#333'
  };

  const cellStyle = {
    padding: '8px',
    borderBottom: '1px solid #eee',
    verticalAlign: 'middle'
  };

  const selectStyle = {
    padding: '6px 4px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '12px',
    background: 'white',
    cursor: 'pointer',
    width: '55px'
  };

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        fontFamily: '"Hiragino Sans", "Noto Sans JP", sans-serif',
        background: '#f8f9fa'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '4px solid #e0e0e0',
            borderTop: '4px solid #667eea',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px'
          }} />
          <p style={{ color: '#666' }}>読み込み中...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        fontFamily: '"Hiragino Sans", "Noto Sans JP", sans-serif',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
      }}>
        <div style={{
          background: 'white',
          padding: '48px',
          borderRadius: '16px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          textAlign: 'center',
          maxWidth: '400px'
        }}>
          <h1 style={{ margin: '0 0 8px 0', fontSize: '28px', color: '#333' }}>📅 シフト管理</h1>
          <p style={{ color: '#666', marginBottom: '32px' }}>Googleアカウントでログインしてください</p>
          
          <button
            onClick={() => supabaseAuth.signInWithGoogle()}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              width: '100%',
              padding: '14px 24px',
              background: 'white',
              border: '2px solid #ddd',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: '500',
              cursor: 'pointer'
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Googleでログイン
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      fontFamily: '"Hiragino Sans", "Noto Sans JP", sans-serif',
      backgroundColor: '#f8f9fa',
      minHeight: '100vh',
      padding: '20px'
    }}>
      <div style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        borderRadius: '12px',
        padding: '24px',
        marginBottom: '24px',
        boxShadow: '0 4px 20px rgba(102, 126, 234, 0.3)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 style={{ color: 'white', margin: 0, fontSize: '24px', fontWeight: '600' }}>📅 シフト管理表</h1>
            <p style={{ color: 'rgba(255,255,255,0.8)', margin: '8px 0 0 0', fontSize: '14px' }}>
              {user.email} {isAdmin && <span style={{ background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: '4px', marginLeft: '8px' }}>管理者</span>}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            {saveStatus && (
              <span style={{ background: 'rgba(255,255,255,0.2)', padding: '8px 16px', borderRadius: '20px', color: 'white', fontSize: '13px' }}>{saveStatus}</span>
            )}
            <button onClick={loadData} style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '8px', fontSize: '12px', cursor: 'pointer' }}>
              🔄 更新
            </button>
            <button onClick={() => supabaseAuth.signOut()} style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '8px', fontSize: '12px', cursor: 'pointer' }}>
              ログアウト
            </button>
          </div>
        </div>
      </div>

      {isAdmin && (
        <div style={{ background: 'white', borderRadius: '12px', padding: '20px', marginBottom: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: '#333' }}>➕ スタッフ追加（管理者専用）</h3>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>ID *</label>
              <input type="text" placeholder="1234" value={newStaff.staff_id} onChange={(e) => setNewStaff({ ...newStaff, staff_id: e.target.value })} style={{ padding: '10px 14px', border: '2px solid #e0e0e0', borderRadius: '8px', fontSize: '14px', width: '80px' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>本名 *</label>
              <input type="text" placeholder="山田太郎" value={newStaff.name} onChange={(e) => setNewStaff({ ...newStaff, name: e.target.value })} style={{ padding: '10px 14px', border: '2px solid #e0e0e0', borderRadius: '8px', fontSize: '14px', width: '120px' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>LINE名</label>
              <input type="text" placeholder="たろう" value={newStaff.line_name} onChange={(e) => setNewStaff({ ...newStaff, line_name: e.target.value })} style={{ padding: '10px 14px', border: '2px solid #e0e0e0', borderRadius: '8px', fontSize: '14px', width: '120px' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>メール *</label>
              <input type="email" placeholder="example@gmail.com" value={newStaff.email} onChange={(e) => setNewStaff({ ...newStaff, email: e.target.value })} style={{ padding: '10px 14px', border: '2px solid #e0e0e0', borderRadius: '8px', fontSize: '14px', width: '200px' }} />
            </div>
            <button onClick={addStaff} style={{ padding: '10px 24px', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>追加</button>
          </div>
        </div>
      )}

      {!isAdmin && myStaffId && (
        <div style={{ background: '#e3f2fd', borderRadius: '12px', padding: '16px 20px', marginBottom: '24px', border: '1px solid #90caf9' }}>
          <p style={{ margin: 0, color: '#1565c0' }}>ℹ️ 自分の行（⭐マーク）のみ編集できます。他のスタッフのシフトは閲覧のみです。</p>
        </div>
      )}

      {!isAdmin && !myStaffId && (
        <div style={{ background: '#fff3e0', borderRadius: '12px', padding: '16px 20px', marginBottom: '24px', border: '1px solid #ffcc80' }}>
          <p style={{ margin: 0, color: '#e65100' }}>⚠️ あなたのメールアドレスはまだスタッフとして登録されていません。管理者に登録を依頼してください。</p>
        </div>
      )}

      <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#f8f9fa' }}>
                <th style={{ ...headerStyle, width: '40px', minWidth: '40px', position: 'sticky', left: 0, zIndex: 3, background: '#f8f9fa' }}>No.</th>
                <th style={{ ...headerStyle, width: '60px', minWidth: '60px', position: 'sticky', left: '40px', zIndex: 3, background: '#f8f9fa' }}>ID</th>
                <th style={{ ...headerStyle, width: '80px', minWidth: '80px', position: 'sticky', left: '100px', zIndex: 3, background: '#f8f9fa', whiteSpace: 'nowrap' }}>本名</th>
                <th style={{ ...headerStyle, width: '80px', minWidth: '80px', position: 'sticky', left: '180px', zIndex: 3, background: '#f8f9fa', whiteSpace: 'nowrap' }}>LINE名</th>
                {dates.map((date, i) => {
                  const dayIndex = date.getDay();
                  return (
                    <th key={i} style={{ ...headerStyle, minWidth: '140px', background: dayIndex === 0 ? '#fff0f0' : dayIndex === 6 ? '#f0f0ff' : '#f8f9fa', color: dayIndex === 0 ? '#e53935' : dayIndex === 6 ? '#1e88e5' : '#333' }}>
                      <div style={{ fontWeight: '700' }}>{date.getMonth() + 1}/{date.getDate()}</div>
                      <div style={{ fontSize: '11px' }}>{dayNames[dayIndex]}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {staff.length === 0 ? (
                <tr><td colSpan={4 + dates.length} style={{ padding: '40px', textAlign: 'center', color: '#999' }}>スタッフが登録されていません</td></tr>
              ) : (
                staff.map((s, index) => {
                  const isMyRow = s.id === myStaffId;
                  const canEditRow = canEdit(s.id);
                  return (
                    <tr key={s.id} style={{ borderBottom: '1px solid #eee', background: isMyRow ? '#fffde7' : 'transparent' }}>
                      <td style={{ ...cellStyle, position: 'sticky', left: 0, background: isMyRow ? '#fffde7' : 'white', zIndex: 2, fontWeight: '600', fontSize: '12px', width: '40px', minWidth: '40px' }}>{index + 1}{isMyRow && ' ⭐'}</td>
                      <td style={{ ...cellStyle, position: 'sticky', left: '40px', background: isMyRow ? '#fffde7' : 'white', zIndex: 2, fontSize: '12px', width: '60px', minWidth: '60px' }}>{s.staff_id}</td>
                      <td style={{ ...cellStyle, position: 'sticky', left: '100px', background: isMyRow ? '#fffde7' : 'white', zIndex: 2, fontWeight: '500', fontSize: '11px', whiteSpace: 'nowrap', width: '80px', minWidth: '80px' }}>{s.name}</td>
                      <td style={{ ...cellStyle, position: 'sticky', left: '180px', background: isMyRow ? '#fffde7' : 'white', zIndex: 2, fontSize: '11px', whiteSpace: 'nowrap', width: '80px', minWidth: '80px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span>{s.line_name || '-'}</span>
                          {isAdmin && <button onClick={() => removeStaff(s.id)} style={{ background: '#ff5252', color: 'white', border: 'none', borderRadius: '4px', width: '20px', height: '20px', fontSize: '12px', cursor: 'pointer', marginLeft: '8px' }}>×</button>}
                        </div>
                      </td>
                      {dates.map((date, i) => {
                        const key = getShiftKey(s.id, date);
                        const shift = shifts[key] || {};
                        const isOff = shift.is_off;
                        const dayIndex = date.getDay();
                        return (
                          <td key={i} style={{ ...cellStyle, background: isOff ? '#ffebee' : (isMyRow ? '#fffde7' : (dayIndex === 0 ? '#fff8f8' : dayIndex === 6 ? '#f8f8ff' : 'white')), minWidth: '140px' }}>
                            {isOff ? (
                              <div style={{ textAlign: 'center' }}>
                                <span style={{ background: '#ff5252', color: 'white', padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: '600' }}>OFF</span>
                                {canEditRow && <button onClick={() => clearShift(s.id, date)} style={{ marginLeft: '8px', background: '#eee', border: 'none', borderRadius: '4px', padding: '4px 8px', fontSize: '10px', cursor: 'pointer' }}>解除</button>}
                              </div>
                            ) : canEditRow ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <select value={shift.start || ''} onChange={(e) => updateShift(s.id, date, 'start', e.target.value)} style={selectStyle}>
                                    <option value="">開始</option>
                                    {timeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                                  </select>
                                  <span style={{ color: '#999' }}>〜</span>
                                  <select value={shift.end || ''} onChange={(e) => updateShift(s.id, date, 'end', e.target.value)} style={selectStyle}>
                                    <option value="">終了</option>
                                    {timeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                                  </select>
                                </div>
                                <button onClick={() => setOff(s.id, date)} style={{ background: '#ffebee', color: '#e53935', border: '1px solid #ffcdd2', borderRadius: '4px', padding: '2px 8px', fontSize: '10px', cursor: 'pointer' }}>OFFにする</button>
                              </div>
                            ) : (
                              <div style={{ textAlign: 'center', color: '#666', fontSize: '12px' }}>{shift.start && shift.end ? `${shift.start}〜${shift.end}` : '-'}</div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: '20px', padding: '16px', background: 'white', borderRadius: '8px', fontSize: '12px', color: '#666' }}>
        <strong>📌 権限について：</strong>
        <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
          <li><strong>管理者</strong>：全スタッフの追加・削除、全シフトの編集が可能</li>
          <li><strong>一般スタッフ</strong>：自分のシフトのみ編集可能、他は閲覧のみ</li>
          <li>⭐マークは自分の行を示します</li>
        </ul>
      </div>
    </div>
  );
}

export default App;
