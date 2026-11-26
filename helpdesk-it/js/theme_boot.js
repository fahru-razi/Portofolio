// Dimuat di <head> (sinkron) agar tema tersimpan langsung diterapkan tanpa kedipan.
try {
  const saved = localStorage.getItem('theme');
  if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;
} catch { /* penyimpanan tidak tersedia: ikuti tema sistem */ }
