import React, { useState, useEffect } from 'react';

// Supabase設定
const SUPABASE_URL = 'https://uqhakbpphjgjnrdzlbju.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxaGFrYnBwaGpnam5yZHpsYmp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjczMDEwMjcsImV4cCI6MjA4Mjg3NzAyN30.Pg7ld7idJa0nxR0AA1dxPifa-NkbA8DYPXsVaMJO-Eo';

// Supabase REST API ヘルパー
const supabaseRequest = async (table, method = 'GET', body = null, query = '') => {
  const url = `${SUPABASE_URL}/rest/v1/${table}${query}`;
  const options = {
    method,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': method === 'POST' ? 'return=representation' : 'return=minimal'
    }
  };
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

function App() {
  const [staff, setStaff] = useState([]);
  const [shifts, setShifts] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState('');
  const [newStaff, setNewStaff] = useState({ staff_id: '', name: '', line_name: '' });
  const [error, setError] = useState(null);

  // 日付の生成（今日から14日間）
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

  // 日付をYYYY-MM-DD形式に変換
  const formatDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // データ読み込み
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await Promise.all([loadStaff(), loadShifts()]);
    } catch (err) {
      setError('データの読み込みに失敗しました: ' + err.message);
    }
    setIsLoading(false);
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

  // 時間オプション生成
  const timeOptions = [];
  for (let h = 0; h <= 24; h++) {
    timeOptions.push(`${h}:00`);
    if (h < 24) timeOptions.push(`${h}:30`);
  }

  const getShiftKey = (staffId, date) => {
    return `${staffId}_${formatDate(date)}`;
  };

  const updateShift = async (staffId, date, field, value) => {
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
    if (!newStaff.staff_id || !newStaff.name) {
      alert('IDと本名は必須です');
      return;
    }
    
    setSaveStatus('保存中...');
    
    try {
      await supabaseRequest('staff', 'POST', {
        staff_id: newStaff.staff_id,
        name: newStaff.name,
        line_name: newStaff.line_name || null
      });
      
      setNewStaff({ staff_id: '', name: '', line_name: '' });
      await loadStaff();
      setSaveStatus('✓ スタッフ追加完了');
      setTimeout(() => setSaveStatus(''), 2000);
    } catch (err) {
      console.error('スタッフ追加エラー:', err);
      if (err.message.includes('duplicate')) {
        alert('このIDは既に使用されています');
      }
      setSaveStatus('⚠ 追加失敗');
      setTimeout(() => setSaveStatus(''), 3000);
    }
  };

  const removeStaff = async (id) => {
    if (!confirm('このスタッフを削除しますか？関連するシフトも全て削除されます。')) return;
    
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

  // スタイル定義
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
          <p style={{ color: '#666' }}>Supabaseに接続中...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        fontFamily: '"Hiragino Sans", "Noto Sans JP", sans-serif',
        background: '#f8f9fa'
      }}>
        <div style={{ textAlign: 'center', padding: '20px', maxWidth: '500px' }}>
          <p style={{ color: '#e53935', fontSize: '18px' }}>⚠ 接続エラー</p>
          <p style={{ color: '#666', fontSize: '14px', marginTop: '8px' }}>{error}</p>
          <button
            onClick={() => { setError(null); loadData(); }}
            style={{
              marginTop: '16px',
              padding: '10px 24px',
              background: '#667eea',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            再接続
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      fontFamily: '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif',
      backgroundColor: '#f8f9fa',
      minHeight: '100vh',
      padding: '20px'
    }}>
      {/* ヘッダー */}
      <div style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        borderRadius: '12px',
        padding: '24px',
        marginBottom: '24px',
        boxShadow: '0 4px 20px rgba(102, 126, 234, 0.3)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 style={{ color: 'white', margin: 0, fontSize: '24px', fontWeight: '600' }}>
              📅 シフト管理表
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.8)', margin: '8px 0 0 0', fontSize: '14px' }}>
              稼働可能時間を入力してください（0:00〜24:00）
            </p>
            <p style={{ color: 'rgba(255,255,255,0.6)', margin: '4px 0 0 0', fontSize: '12px' }}>
              ☁️ Supabase連携 | 🌐 オンライン共有
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {saveStatus && (
              <span style={{
                background: 'rgba(255,255,255,0.2)',
                padding: '8px 16px',
                borderRadius: '20px',
                color: 'white',
                fontSize: '13px',
                fontWeight: '500'
              }}>
                {saveStatus}
              </span>
            )}
            <button
              onClick={loadData}
              style={{
                padding: '8px 16px',
                background: 'rgba(255,255,255,0.2)',
                color: 'white',
                border: '1px solid rgba(255,255,255,0.3)',
                borderRadius: '8px',
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              🔄 更新
            </button>
          </div>
        </div>
      </div>

      {/* スタッフ追加フォーム */}
      <div style={{
        background: 'white',
        borderRadius: '12px',
        padding: '20px',
        marginBottom: '24px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
      }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: '#333' }}>
          ➕ スタッフ追加
        </h3>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>ID *</label>
            <input
              type="text"
              placeholder="1234"
              value={newStaff.staff_id}
              onChange={(e) => setNewStaff({ ...newStaff, staff_id: e.target.value })}
              style={{
                padding: '10px 14px',
                border: '2px solid #e0e0e0',
                borderRadius: '8px',
                fontSize: '14px',
                width: '100px',
                outline: 'none'
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>本名 *</label>
            <input
              type="text"
              placeholder="山田太郎"
              value={newStaff.name}
              onChange={(e) => setNewStaff({ ...newStaff, name: e.target.value })}
              style={{
                padding: '10px 14px',
                border: '2px solid #e0e0e0',
                borderRadius: '8px',
                fontSize: '14px',
                width: '140px',
                outline: 'none'
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>LINE名</label>
            <input
              type="text"
              placeholder="たろう"
              value={newStaff.line_name}
              onChange={(e) => setNewStaff({ ...newStaff, line_name: e.target.value })}
              style={{
                padding: '10px 14px',
                border: '2px solid #e0e0e0',
                borderRadius: '8px',
                fontSize: '14px',
                width: '140px',
                outline: 'none'
              }}
            />
          </div>
          <button
            onClick={addStaff}
            style={{
              padding: '10px 24px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            追加
          </button>
        </div>
      </div>

      {/* シフト表 */}
      <div style={{
        background: 'white',
        borderRadius: '12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        overflow: 'hidden'
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#f8f9fa' }}>
                <th style={{ ...headerStyle, width: '50px', position: 'sticky', left: 0, zIndex: 3, background: '#f8f9fa' }}>No.</th>
                <th style={{ ...headerStyle, width: '70px', position: 'sticky', left: '50px', zIndex: 3, background: '#f8f9fa' }}>ID</th>
                <th style={{ ...headerStyle, width: '100px', position: 'sticky', left: '120px', zIndex: 3, background: '#f8f9fa' }}>本名</th>
                <th style={{ ...headerStyle, width: '120px', position: 'sticky', left: '220px', zIndex: 3, background: '#f8f9fa' }}>LINE名</th>
                {dates.map((date, i) => {
                  const dayIndex = date.getDay();
                  return (
                    <th key={i} style={{
                      ...headerStyle,
                      minWidth: '140px',
                      background: dayIndex === 0 ? '#fff0f0' : dayIndex === 6 ? '#f0f0ff' : '#f8f9fa',
                      color: dayIndex === 0 ? '#e53935' : dayIndex === 6 ? '#1e88e5' : '#333'
                    }}>
                      <div style={{ fontWeight: '700' }}>{date.getMonth() + 1}/{date.getDate()}</div>
                      <div style={{ fontSize: '11px', fontWeight: '500' }}>{dayNames[dayIndex]}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {staff.length === 0 ? (
                <tr>
                  <td colSpan={4 + dates.length} style={{ padding: '40px', textAlign: 'center', color: '#999' }}>
                    スタッフが登録されていません。上のフォームから追加してください。
                  </td>
                </tr>
              ) : (
                staff.map((s, index) => (
                  <tr key={s.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ ...cellStyle, position: 'sticky', left: 0, background: 'white', zIndex: 2, fontWeight: '600' }}>
                      {index + 1}
                    </td>
                    <td style={{ ...cellStyle, position: 'sticky', left: '50px', background: 'white', zIndex: 2 }}>
                      {s.staff_id}
                    </td>
                    <td style={{ ...cellStyle, position: 'sticky', left: '120px', background: 'white', zIndex: 2, fontWeight: '500' }}>
                      {s.name}
                    </td>
                    <td style={{ ...cellStyle, position: 'sticky', left: '220px', background: 'white', zIndex: 2 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>{s.line_name || '-'}</span>
                        <button
                          onClick={() => removeStaff(s.id)}
                          style={{
                            background: '#ff5252',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            width: '20px',
                            height: '20px',
                            fontSize: '12px',
                            cursor: 'pointer',
                            marginLeft: '8px'
                          }}
                        >
                          ×
                        </button>
                      </div>
                    </td>
                    {dates.map((date, i) => {
                      const key = getShiftKey(s.id, date);
                      const shift = shifts[key] || {};
                      const isOff = shift.is_off;
                      const dayIndex = date.getDay();
                      
                      return (
                        <td key={i} style={{
                          ...cellStyle,
                          background: isOff ? '#ffebee' : (dayIndex === 0 ? '#fff8f8' : dayIndex === 6 ? '#f8f8ff' : 'white'),
                          minWidth: '140px'
                        }}>
                          {isOff ? (
                            <div style={{ textAlign: 'center' }}>
                              <span style={{
                                background: '#ff5252',
                                color: 'white',
                                padding: '4px 12px',
                                borderRadius: '12px',
                                fontSize: '12px',
                                fontWeight: '600'
                              }}>
                                OFF
                              </span>
                              <button
                                onClick={() => clearShift(s.id, date)}
                                style={{
                                  marginLeft: '8px',
                                  background: '#eee',
                                  border: 'none',
                                  borderRadius: '4px',
                                  padding: '4px 8px',
                                  fontSize: '10px',
                                  cursor: 'pointer'
                                }}
                              >
                                解除
                              </button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <select
                                  value={shift.start || ''}
                                  onChange={(e) => updateShift(s.id, date, 'start', e.target.value)}
                                  style={selectStyle}
                                >
                                  <option value="">開始</option>
                                  {timeOptions.map(t => (
                                    <option key={t} value={t}>{t}</option>
                                  ))}
                                </select>
                                <span style={{ color: '#999' }}>〜</span>
                                <select
                                  value={shift.end || ''}
                                  onChange={(e) => updateShift(s.id, date, 'end', e.target.value)}
                                  style={selectStyle}
                                >
                                  <option value="">終了</option>
                                  {timeOptions.map(t => (
                                    <option key={t} value={t}>{t}</option>
                                  ))}
                                </select>
                              </div>
                              <button
                                onClick={() => setOff(s.id, date)}
                                style={{
                                  background: '#ffebee',
                                  color: '#e53935',
                                  border: '1px solid #ffcdd2',
                                  borderRadius: '4px',
                                  padding: '2px 8px',
                                  fontSize: '10px',
                                  cursor: 'pointer'
                                }}
                              >
                                OFFにする
                              </button>
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* フッター */}
      <div style={{
        marginTop: '20px',
        padding: '16px',
        background: 'white',
        borderRadius: '8px',
        fontSize: '12px',
        color: '#666',
        display: 'flex',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div>
          <strong>📌 使い方：</strong>
          <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
            <li>各セルで開始時間と終了時間を選択してシフトを設定</li>
            <li>「OFFにする」ボタンで休みに設定</li>
            <li>データはクラウドに自動保存 ☁️</li>
            <li>URLを共有すれば複数人で同時編集可能 🌐</li>
          </ul>
        </div>
        <div style={{ textAlign: 'right', color: '#999' }}>
          <p style={{ margin: 0 }}>スタッフ数: {staff.length}人</p>
          <p style={{ margin: '4px 0 0 0' }}>登録シフト数: {Object.keys(shifts).length}件</p>
        </div>
      </div>
    </div>
  );
}

export default App;
