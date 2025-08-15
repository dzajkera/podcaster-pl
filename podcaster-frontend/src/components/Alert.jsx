export default function Alert({ type = 'info', children, style }) {
    const palette = {
      info:   { bg: '#eff6ff', border: '#bfdbfe', color: '#1d4ed8' },
      success:{ bg: '#ecfdf5', border: '#a7f3d0', color: '#065f46' },
      error:  { bg: '#fef2f2', border: '#fecaca', color: '#991b1b' },
    }[type] || { bg: '#f3f4f6', border: '#e5e7eb', color: '#111827' };
  
    return (
      <div
        style={{
          background: palette.bg,
          border: `1px solid ${palette.border}`,
          color: palette.color,
          padding: '10px 12px',
          borderRadius: 8,
          ...style,
        }}
      >
        {children}
      </div>
    );
  }