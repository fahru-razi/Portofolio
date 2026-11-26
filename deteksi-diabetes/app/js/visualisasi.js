// Visualisasi Peta
document.addEventListener('DOMContentLoaded', function () {
    // Variabel global untuk menyimpan instance peta, layer geojson, data provinsi, dan chart kota
    let indonesiaMap; // Instance peta Indonesia
    let geojsonLayer; // Layer GeoJSON untuk peta
    let provinceData = {}; // Objek untuk menyimpan data statistik provinsi
    let cityChart = null; // Instance chart untuk data kota

    // Fungsi untuk memformat nama provinsi agar konsisten dengan nama pada database
    function formatProvinceName(name) {
        return name.split(' ').map(word =>
            word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        ).join(' '); // Mengubah nama provinsi menjadi format yang konsisten
    }

    // Inisialisasi peta Indonesia
    function initMap() {
        // Hapus instance peta sebelumnya (jika ada) untuk menghindari duplikasi saat reload
        if (indonesiaMap) {
            indonesiaMap.remove(); // Menghapus peta yang ada
        }

        // Buat peta dengan pengaturan batas zoom, kontrol interaksi, animasi, dan area panning
        indonesiaMap = L.map('indonesiaMap', {
            center: [-2.5, 118], // Pusat peta di tengah Indonesia
            zoom: 5, // Tingkat zoom awal
            minZoom: 4, // Zoom minimum yang diperbolehkan
            maxZoom: 10, // Zoom maksimum
            zoomControl: true, // Menampilkan kontrol zoom
            scrollWheelZoom: true, // Mengizinkan zoom dengan scroll mouse
            doubleClickZoom: true, // Mengizinkan zoom dengan double click
            touchZoom: true, // Mengizinkan zoom dengan sentuhan
            boxZoom: false, // Nonaktifkan box zoom untuk mencegah bug UI
            keyboard: true, // Mengizinkan navigasi dengan keyboard
            dragging: true, // Mengizinkan peta untuk diseret
            zoomAnimation: true, // Aktifkan animasi saat zoom
            zoomAnimationThreshold: 4, // Ambang batas untuk animasi zoom
            fadeAnimation: true, // Aktifkan animasi fade
            markerZoomAnimation: true, // Aktifkan animasi zoom pada marker
            maxBounds: [ // Batasi area panning agar tetap dalam wilayah Indonesia
                [-11.5, 94.0],
                [6.5, 142.0]
            ],
            maxBoundsViscosity: 0.3 // Tingkat resistensi saat menyeret ke luar batas
        });

        // Tambahkan tile layer dari OpenStreetMap dengan pengaturan efisiensi dan fallback error
        const tileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            subdomains: 'abcd', // DEMO: tile CARTO (data OSM) agar tidak diblokir OSM saat dibuka tanpa HTTP Referer (file://, iframe lokal)
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>', // Attribusi untuk OpenStreetMap
            maxZoom: 10, // Zoom maksimum untuk tile
            minZoom: 4, // Zoom minimum untuk tile
            updateWhenIdle: false, // Hindari update berlebih saat idle
            updateWhenZooming: false, // Hindari update saat zooming
            keepBuffer: 2, // Buffer untuk tile
            errorTileUrl: 'data:image/png;base64,...' // Gambar fallback jika tile gagal dimuat
        }).addTo(indonesiaMap); // Menambahkan tile layer ke peta

        // Saat zoom dimulai, nonaktifkan scroll untuk menghindari interaksi tidak sengaja
        indonesiaMap.on('zoomstart', function () {
            indonesiaMap.scrollWheelZoom.disable(); // Nonaktifkan zoom dengan scroll
        });

        // Aktifkan kembali scroll dan update styling layer setelah zoom selesai
        indonesiaMap.on('zoomend', function () {
            setTimeout(() => {
                indonesiaMap.scrollWheelZoom.enable(); // Aktifkan kembali zoom dengan scroll
            }, 100);
            updateLayerStyling(); // Sesuaikan tampilan layer berdasarkan zoom
        });

        // Validasi ukuran ulang ketika peta di-resize secara internal
        indonesiaMap.on('resize', function () {
            indonesiaMap.invalidateSize({ // Memvalidasi ukuran peta
                animate: true, // Animasi saat validasi
                duration: 0.25 // Durasi animasi
            });
        });

        // Validasi ukuran ulang ketika ukuran jendela browser berubah
        window.addEventListener('resize', debounce(function () {
            if (indonesiaMap) {
                indonesiaMap.invalidateSize({ // Memvalidasi ukuran peta
                    animate: true, // Animasi saat validasi
                    duration: 0.25 // Durasi animasi
                });
            }
        }, 250)); // Debounce untuk menghindari pemanggilan berlebihan

        console.log('Memulai load data...'); // Log untuk memulai proses load data

        // Mulai proses load data
        loadMapData(); // Memanggil fungsi untuk memuat data peta
    }

    // Fungsi debounce untuk menunda eksekusi fungsi resize agar tidak terlalu sering dipanggil
    function debounce(func, wait) {
        let timeout; // Variabel untuk menyimpan timeout
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout); // Menghapus timeout
                func(...args); // Menjalankan fungsi
            };
            clearTimeout(timeout); // Menghapus timeout sebelumnya
            timeout = setTimeout(later, wait); // Mengatur timeout baru
        };
    }

    // Fungsi utama untuk mengambil data GeoJSON dan data statistik provinsi
    function loadMapData() {
        Promise.all([ // Mengambil data secara bersamaan
                fetch('/data/geojson').then(response => {
                    if (!response.ok) {
                        throw new Error('Gagal mengambil data GeoJSON: ' + response.statusText); // Menangani error jika fetch gagal
                    }
                    return response.json(); // Mengembalikan data dalam format JSON
                }),
                fetch('/data/province_stats').then(response => {
                    if (!response.ok) {
                        throw new Error('Gagal mengambil statistik provinsi: ' + response.statusText); // Menangani error jika fetch gagal
                    }
                    return response.json(); // Mengembalikan data dalam format JSON
                })
            ])
            .then(([geojsonData, statsData]) => {
                console.log('Data berhasil dimuat.'); // Log jika data berhasil dimuat

                if (geojsonData.features && geojsonData.features.length > 0) {
                    console.log('Contoh properti GeoJSON:', geojsonData.features[0].properties); // Log contoh properti GeoJSON
                }

                // Simpan data statistik provinsi ke dalam objek provinceData
                statsData.forEach(province => {
                    provinceData[province.provinsi] = { // Menyimpan data provinsi
                        totalCases: province.total_cases, // Total kasus
                        diabetesCases: province.diabetes_cases, // Kasus diabetes
                        nonDiabetesCases: province.non_diabetes_cases // Kasus non-diabetes
                    };
                });

                console.log('Data provinsi dari database:', Object.keys(provinceData)); // Log data provinsi yang dimuat

                // Buat layer geojson dan tambahkan ke peta, serta tampilkan legenda
                try {
                    geojsonLayer = L.geoJSON(geojsonData, { // Membuat layer GeoJSON
                        style: styleFeature, // Mengatur style layer
                        onEachFeature: onEachFeature // Menambahkan interaktivitas pada setiap fitur
                    }).addTo(indonesiaMap); // Menambahkan layer ke peta

                    createLegend(); // Membuat legenda

                    // Setelah data ditambahkan, sesuaikan tampilan peta agar sesuai dengan batas layer
                    setTimeout(() => {
                        if (geojsonLayer && geojsonLayer.getBounds) {
                            indonesiaMap.fitBounds(geojsonLayer.getBounds(), { // Menyesuaikan tampilan peta
                                padding: [20, 20], // Padding untuk tampilan
                                maxZoom: 6 // Zoom maksimum saat menyesuaikan
                            });
                        }
                    }, 500);

                } catch (error) {
                    console.error('Error creating GeoJSON layer:', error); // Menangani error saat membuat layer GeoJSON
                }
            })
            .catch(error => {
                console.error('Error loading data:', error); // Menangani error saat memuat data
                alert('Gagal memuat data peta. Silakan coba lagi nanti.'); // Menampilkan alert jika gagal memuat data
            });
    }

    // Update tampilan layer provinsi (ketebalan border dan opacity) sesuai tingkat zoom
    function updateLayerStyling() {
        if (!geojsonLayer) return; // Jika tidak ada layer, keluar dari fungsi

        const zoom = indonesiaMap.getZoom(); // Mendapatkan tingkat zoom saat ini

        geojsonLayer.eachLayer(function (layer) { // Mengiterasi setiap layer dalam geojsonLayer
            let weight = 1; // Ketebalan border default
            let opacity = 1; // Opacity default

            if (zoom <= 4) {
                weight = 0.5; // Ketebalan border untuk zoom <= 4
                opacity = 0.8; // Opacity untuk zoom <= 4
            } else if (zoom <= 6) {
                weight = 1; // Ketebalan border untuk zoom <= 6
                opacity = 1; // Opacity untuk zoom <= 6
            } else {
                weight = 2; // Ketebalan border untuk zoom > 6
                opacity = 1; // Opacity untuk zoom > 6
            }

            layer.setStyle({ // Mengatur style layer
                weight: weight, // Ketebalan border
                opacity: opacity // Opacity
            });
        });
    }

    // Tentukan style layer provinsi berdasarkan data rasio kasus diabetes
    function styleFeature(feature) {
        const provinceName = formatProvinceName(feature.properties.name); // Memformat nama provinsi

        if (provinceData[provinceName]) {
            const diabetesRate = provinceData[provinceName].diabetesCases /
                provinceData[provinceName].totalCases * 100; // Menghitung rasio kasus diabetes

            return {
                fillColor: getColor(diabetesRate), // Mengatur warna berdasarkan rasio
                weight: 1, // Ketebalan border
                opacity: 1, // Opacity
                color: 'white', // Warna border
                fillOpacity: 0.7 // Opacity untuk fill
            };
        } else {
            return {
                fillColor: '#E5E5E5', // Warna default jika tidak ada data
                weight: 1, // Ketebalan border
                opacity: 1, // Opacity
                color: 'white', // Warna border
                fillOpacity: 0.7 // Opacity untuk fill
            };
        }
    }

    // Pilih warna berdasarkan tingkat persentase kasus diabetes
    function getColor(rate) {
        return rate > 70 ? '#800026' : // Warna untuk > 70%
            rate > 60 ? '#BD0026' : // Warna untuk > 60%
            rate > 50 ? '#E31A1C' : // Warna untuk > 50%
            rate > 40 ? '#FC4E2A' : // Warna untuk > 40%
            rate > 30 ? '#FD8D3C' : // Warna untuk > 30%
            rate > 20 ? '#FEB24C' : // Warna untuk > 20%
            rate > 10 ? '#FED976' : // Warna untuk > 10%
            '#FFEDA0'; // Warna default
    }

    // Tambahkan interaktivitas pada setiap provinsi (tooltip dan event)
    function onEachFeature(feature, layer) {
        const provinceName = formatProvinceName(feature.properties.name); // Memformat nama provinsi

        let tooltipContent = `<strong>${provinceName}</strong>`; // Konten tooltip dengan nama provinsi
        if (provinceData[provinceName]) {
            const data = provinceData[provinceName]; // Mengambil data provinsi
            const diabetesRate = (data.diabetesCases / data.totalCases * 100).toFixed(1); // Menghitung rasio diabetes
            const nonDiabetesRate = (data.nonDiabetesCases / data.totalCases * 100).toFixed(1); // Menghitung rasio non-diabetes
            tooltipContent += `<br>Terindikasi Diabetes: ${data.diabetesCases} (${diabetesRate}%)`; // Menambahkan informasi diabetes
            tooltipContent += `<br>Tidak Terindikasi Diabetes: ${data.nonDiabetesCases} (${nonDiabetesRate}%)`; // Menambahkan informasi non-diabetes
            tooltipContent += `<br>Total Kasus: ${data.totalCases}`; // Menambahkan total kasus
        } else {
            tooltipContent += '<br>Tidak ada data'; // Menampilkan pesan jika tidak ada data
        }

        layer.bindTooltip(tooltipContent); // Mengikat tooltip ke layer

        layer.on({ // Menambahkan event pada layer
            mouseover: highlightFeature, // Event saat mouseover
            mouseout: resetHighlight, // Event saat mouseout
            click: showCityData // Event saat layer diklik
        });
    }

    // Highlight provinsi saat kursor diarahkan (dengan efek visual)
    function highlightFeature(e) {
        const layer = e.target; // Mengambil layer yang dihover

        layer.setStyle({ // Mengatur style layer saat dihover
            weight: 3, // Ketebalan border saat dihover
            color: '#666', // Warna border saat dihover
            fillOpacity: 0.8 // Opacity fill saat dihover
        });

        if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
            layer.bringToFront(); // Membawa layer ke depan jika bukan browser IE, Opera, atau Edge
        }
    }

    // Reset tampilan provinsi ke semula saat kursor keluar
    function resetHighlight(e) {
        geojsonLayer.resetStyle(e.target); // Mengembalikan style layer ke semula
    }

    // Tampilkan data kota saat provinsi diklik
    function showCityData(e) {
        const province = formatProvinceName(e.target.feature.properties.name); // Memformat nama provinsi

        document.querySelector('.province-title').textContent = `Data Diabetes di ${province}`; // Menampilkan judul data kota

        fetch(`/data/city_stats/${province}`) // Mengambil data statistik kota
            .then(response => {
                if (!response.ok) {
                    throw new Error('Gagal mengambil data kota: ' + response.statusText); // Menangani error jika fetch gagal
                }
                return response.json(); // Mengembalikan data dalam format JSON
            })
            .then(cityData => {
                console.log(`Data kota untuk ${province}:`, cityData); // Log data kota yang diambil
                updateCityChart(cityData, province); // Memperbarui chart kota
            })
            .catch(error => {
                console.error('Error loading city data:', error); // Menangani error saat memuat data kota
                document.querySelector('.province-title').textContent =
                    `Gagal memuat data untuk ${province}`; // Menampilkan pesan jika gagal memuat data
            });
    }

    // Perbarui grafik bar kota berdasarkan data yang diambil
    function updateCityChart(cityData, provinceName) {
        const labels = cityData.map(item => item.kota); // Mengambil nama kota
        const diabetesCases = cityData.map(item => item.diabetes_cases); // Mengambil jumlah kasus diabetes
        const nonDiabetesCases = cityData.map(item => item.non_diabetes_cases); // Mengambil jumlah kasus non-diabetes
        const totalCases = cityData.map(item => item.total_cases); // Mengambil total kasus

        if (cityChart) {
            cityChart.destroy(); // Hapus chart lama sebelum membuat baru
        }

        const ctx = document.getElementById('cityChart').getContext('2d'); // Mengambil konteks dari elemen canvas
        cityChart = new Chart(ctx, { // Membuat chart baru
            type: 'bar', // Tipe chart
            data: {
                labels: labels, // Label untuk sumbu x
                datasets: [{
                        label: 'Terindikasi Diabetes', // Label untuk dataset diabetes
                        data: diabetesCases, // Data untuk kasus diabetes
                        backgroundColor: 'rgba(255, 99, 132, 0.7)', // Warna latar belakang untuk dataset diabetes
                        borderColor: 'rgba(255, 99, 132, 1)', // Warna border untuk dataset diabetes
                        borderWidth: 1 // Ketebalan border untuk dataset diabetes
                    },
                    {
                        label: 'Tidak Terindikasi Diabetes', // Label untuk dataset non-diabetes
                        data: nonDiabetesCases, // Data untuk kasus non-diabetes
                        backgroundColor: 'rgba(75, 192, 192, 0.7)', // Warna latar belakang untuk dataset non-diabetes
                        borderColor: 'rgba(75, 192, 192, 1)', // Warna border untuk dataset non-diabetes
                        borderWidth: 1 // Ketebalan border untuk dataset non-diabetes
                    }
                ]
            },
            options: {
                responsive: true, // Responsif terhadap ukuran layar
                maintainAspectRatio: false, // Tidak mempertahankan rasio aspek
                animation: {
                    duration: 750, // Durasi animasi saat chart diperbarui
                    easing: 'easeInOutQuart' // Easing untuk animasi
                },
                plugins: {
                    title: {
                        display: false // Menyembunyikan judul chart
                    },
                    legend: {
                        position: 'top', // Posisi legend di atas chart
                    },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                let label = context.dataset.label || ''; // Mengambil label dataset
                                if (label) {
                                    label += ': '; // Menambahkan titik dua
                                }
                                label += context.parsed.y; // Menambahkan nilai y
                                return label; // Mengembalikan label
                            },
                            afterLabel: function (context) {
                                const value = context.parsed.y; // Mengambil nilai y
                                const total = totalCases[context.dataIndex]; // Mengambil total kasus
                                const percentage = (value / total * 100).toFixed(1); // Menghitung persentase
                                return `${percentage}% dari total kasus`; // Mengembalikan persentase
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true, // Memulai sumbu y dari nol
                        title: {
                            display: true, // Menampilkan judul sumbu y
                            text: 'Jumlah Kasus' // Teks untuk judul sumbu y
                        }
                    },
                    x: {
                        title: {
                            display: true, // Menampilkan judul sumbu x
                            text: 'Kota/Kabupaten' // Teks untuk judul sumbu x
                        }
                    }
                }
            }
        });
    }

    // Buat legenda warna di bawah peta sesuai klasifikasi persentase
    function createLegend() {
        const legend = document.querySelector('.legend'); // Mengambil elemen legend

        // Data legend sesuai spesifikasi baru
        const legendData = [{
                range: '0-10%', // Rentang untuk 0-10%
                color: '#FFEDA0', // Warna untuk rentang ini
                label: 'Rendah' // Label untuk rentang ini
            },
            {
                range: '10-20%', // Rentang untuk 10-20%
                color: '#FED976', // Warna untuk rentang ini
                label: 'Cukup Rendah' // Label untuk rentang ini
            },
            {
                range: '20-30%', // Rentang untuk 20-30%
                color: '#FEB24C', // Warna untuk rentang ini
                label: 'Sedang' // Label untuk rentang ini
            },
            {
                range: '30-40%', // Rentang untuk 30-40%
                color: '#FD8D3C', // Warna untuk rentang ini
                label: 'Cukup Tinggi' // Label untuk rentang ini
            },
            {
                range: '40-50%', // Rentang untuk 40-50%
                color: '#FC4E2A', // Warna untuk rentang ini
                label: 'Tinggi' // Label untuk rentang ini
            },
            {
                range: '50-60%', // Rentang untuk 50-60%
                color: '#E31A1C', // Warna untuk rentang ini
                label: 'Sangat Tinggi' // Label untuk rentang ini
            },
            {
                range: '60-70%', // Rentang untuk 60-70%
                color: '#BD0026', // Warna untuk rentang ini
                label: 'Ekstrem Tinggi' // Label untuk rentang ini
            },
            {
                range: '70%+', // Rentang untuk lebih dari 70%
                color: '#800026', // Warna untuk rentang ini
                label: 'Kritis' // Label untuk rentang ini
            },
            {
                range: 'Tidak ada data', // Rentang untuk tidak ada data
                color: '#d1d1d1', // Warna untuk tidak ada data
                label: '' // Label kosong untuk tidak ada data
            }
        ];

        // Bersihkan legend yang ada
        legend.innerHTML = ''; // Menghapus konten legend yang ada

        // Buat item legend
        legendData.forEach(item => {
            const legendItem = document.createElement('div'); // Membuat elemen div untuk item legend
            legendItem.className = 'legend-item'; // Menambahkan kelas untuk styling

            const colorBox = document.createElement('div'); // Membuat elemen div untuk kotak warna
            colorBox.className = 'legend-color'; // Menambahkan kelas untuk styling
            colorBox.style.backgroundColor = item.color; // Mengatur warna kotak

            const textSpan = document.createElement('span'); // Membuat elemen span untuk teks
            textSpan.className = 'legend-text'; // Menambahkan kelas untuk styling
            textSpan.textContent = item.range; // Mengatur teks untuk rentang

            legendItem.appendChild(colorBox); // Menambahkan kotak warna ke item legend
            legendItem.appendChild(textSpan); // Menambahkan teks ke item legend

            if (item.label) {
                const labelSpan = document.createElement('span'); // Membuat elemen span untuk label
                labelSpan.className = 'legend-label'; // Menambahkan kelas untuk styling
                labelSpan.textContent = `(${item.label})`; // Mengatur teks untuk label
                legendItem.appendChild(labelSpan); // Menambahkan label ke item legend
            }

            legend.appendChild(legendItem); // Menambahkan item legend ke legend
        });
    }

    // Update fungsi styleFeature untuk menggunakan warna #d1d1d1 untuk data kosong
    function styleFeature(feature) {
        const provinceName = formatProvinceName(feature.properties.name); // Memformat nama provinsi

        if (provinceData[provinceName]) {
            const diabetesRate = provinceData[provinceName].diabetesCases /
                provinceData[provinceName].totalCases * 100; // Menghitung rasio kasus diabetes

            return {
                fillColor: getColor(diabetesRate), // Mengatur warna berdasarkan rasio
                weight: 1, // Ketebalan border
                opacity: 1, // Opacity
                color: 'white', // Warna border
                fillOpacity: 0.7 // Opacity untuk fill
            };
        } else {
            return {
                fillColor: '#d1d1d1', // Sesuai dengan legend baru
                weight: 1, // Ketebalan border
                opacity: 1, // Opacity
                color: 'white', // Warna border
                fillOpacity: 0.7 // Opacity untuk fill
            };
        }
    }

    // Panggil fungsi inisialisasi saat halaman dimuat
    initMap(); // Memanggil fungsi untuk inisialisasi peta
});