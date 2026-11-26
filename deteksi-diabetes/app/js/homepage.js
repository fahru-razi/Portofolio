// Menunggu hingga DOM sepenuhnya dimuat sebelum menjalankan script
document.addEventListener('DOMContentLoaded', function () {
    console.log('DOM telah dimuat - Inisialisasi script');

    // Inisialisasi semua modul aplikasi
    initNavigation(); // Menginisialisasi navigasi mobile
    initFormValidation(); // Menginisialisasi validasi form
    initBMICalculator(); // Menginisialisasi kalkulator BMI
    initDiabetesPedigreeFunction(); // Menginisialisasi fungsi keturunan diabetes
    initFormProgress(); // Menginisialisasi progress bar form
    initResetButton(); // Menginisialisasi tombol reset
    initPredictionFeature(); // Menginisialisasi fitur prediksi
    initFAQToggle(); // Menginisialisasi toggle FAQ
    initLocationDropdown(); // Menginisialisasi dropdown lokasi
});

/**
    Menginisialisasi navigasi mobile dan tombol hamburger
*/
function initNavigation() {
    const hamburger = document.getElementById('hamburger'); // Mengambil elemen tombol hamburger
    const navMenu = document.getElementById('navMenu'); // Mengambil elemen menu navigasi

    if (hamburger) {
        hamburger.addEventListener('click', function () {
            this.classList.toggle('active'); // Mengubah kelas aktif pada tombol hamburger
            navMenu.classList.toggle('active'); // Mengubah kelas aktif pada menu navigasi
        });
        console.log('Navigasi mobile diinisialisasi'); // Menampilkan pesan di console
    }
}

/**
 * Menginisialisasi validasi form dengan pemeriksaan lebih detail
 * dan memberikan umpan balik visual yang jelas kepada pengguna
 */
function initFormValidation() {
    const form = document.getElementById('healthForm'); // Mengambil elemen form kesehatan
    const requiredFields = [
        'pregnancies', 'glucose', 'bloodPressure', 'bmi',
        'diabetesPedigreeFunction', 'age', 'provinsi', 'kota_kabupaten'
    ]; // Daftar field yang wajib diisi

    // Menambahkan event listener untuk validasi real-time
    requiredFields.forEach(fieldId => {
        const field = document.getElementById(fieldId); // Mengambil elemen input berdasarkan ID
        field.addEventListener('input', function () {
            validateField(this); // Memvalidasi field saat input berubah
        });
    });

    // Validasi saat form disubmit
    form.addEventListener('submit', function (event) {
        event.preventDefault(); // Mencegah pengiriman form default
        if (validateForm()) {
            // Lanjutkan proses prediksi jika form valid
            initPredictionFeature(); // Menginisialisasi fitur prediksi
        }
    });
}

/**
 * Memvalidasi sebuah field secara individual
 * @param {HTMLInputElement} field - Elemen input yang akan divalidasi
 * @returns {boolean} - Status validasi field
 */
function validateField(field) {
    // Cek apakah field kosong
    if (!field.value.trim()) {
        field.classList.add('input-error'); // Menambahkan kelas error jika field kosong
        showFieldErrorMessage(field, 'Kolom tidak boleh kosong'); // Menampilkan pesan error
        return false; // Mengembalikan status validasi false
    }

    // Validasi rentang nilai untuk field numerik
    const validationRules = {
        'pregnancies': {
            min: 0,
            max: 20,
            errorMsg: 'Jumlah kehamilan tidak valid' // Pesan error untuk kehamilan
        },
        'glucose': {
            min: 40,
            max: 600,
            errorMsg: 'Kadar gula darah tidak valid' // Pesan error untuk kadar gula
        },
        'bloodPressure': {
            min: 40,
            max: 150,
            errorMsg: 'Tekanan darah tidak valid' // Pesan error untuk tekanan darah
        },
        'bmi': {
            min: 10,
            max: 60,
            errorMsg: 'BMI tidak valid' // Pesan error untuk BMI
        },
        'age': {
            min: 10,
            max: 122,
            errorMsg: 'Usia tidak valid' // Pesan error untuk usia
        }
    };

    const rule = validationRules[field.id]; // Mengambil aturan validasi untuk field
    if (rule) {
        const value = parseFloat(field.value); // Mengonversi nilai field menjadi float
        if (isNaN(value) || value < rule.min || value > rule.max) {
            field.classList.add('input-error'); // Menambahkan kelas error jika nilai tidak valid
            showFieldErrorMessage(field, rule.errorMsg); // Menampilkan pesan error
            return false; // Mengembalikan status validasi false
        }
    }

    // Hapus error styling jika valid
    field.classList.remove('input-error'); // Menghapus kelas error
    hideFieldErrorMessage(field); // Menyembunyikan pesan error
    return true; // Mengembalikan status validasi true
}

/**
 * Menampilkan pesan error di samping field
 * @param {HTMLInputElement} field - Elemen input yang memiliki error
 * @param {string} message - Pesan error yang akan ditampilkan
 */
function showFieldErrorMessage(field, message) {
    // Hapus pesan error sebelumnya jika ada
    hideFieldErrorMessage(field);

    // Buat elemen pesan error
    const errorElement = document.createElement('div'); // Membuat elemen div untuk pesan error
    errorElement.className = 'error-message'; // Menambahkan kelas untuk styling
    errorElement.textContent = message; // Menambahkan pesan error ke elemen

    // Tambahkan pesan error setelah field
    field.parentNode.insertBefore(errorElement, field.nextSibling); // Menyisipkan pesan error setelah field
}

/**
 * Menyembunyikan pesan error di samping field
 * @param {HTMLInputElement} field - Elemen input yang akan dihapus pesan errornya
 */
function hideFieldErrorMessage(field) {
    const nextElement = field.nextElementSibling; // Mengambil elemen berikutnya setelah field
    if (nextElement && nextElement.classList.contains('error-message')) {
        nextElement.remove(); // Menghapus elemen pesan error jika ada
    }
}

/**
 * Validasi seluruh form sebelum prediksi
 * @returns {boolean} - Status validasi keseluruhan form
 */
function validateForm() {
    const requiredFields = [
        'pregnancies', 'glucose', 'bloodPressure', 'bmi',
        'diabetesPedigreeFunction', 'age', 'provinsi', 'kota_kabupaten'
    ]; // Daftar field yang wajib diisi

    let isValid = true; // Status validasi keseluruhan form

    requiredFields.forEach(id => {
        const input = document.getElementById(id); // Mengambil elemen input berdasarkan ID
        if (!validateField(input)) {
            isValid = false; // Jika ada field yang tidak valid, set isValid ke false
        }
    });

    // Validasi khusus untuk dropdown lokasi
    if (!validateLocation()) {
        isValid = false; // Jika lokasi tidak valid, set isValid ke false
    }

    // Tampilkan notifikasi global jika form tidak valid
    if (!isValid) {
        showGlobalErrorNotification('Mohon isi semua kolom dengan benar sebelum mengirim!'); // Menampilkan notifikasi error
    }

    return isValid; // Mengembalikan status validasi keseluruhan form
}

/**
 * Memvalidasi pemilihan lokasi
 * @returns {boolean} - Status validasi lokasi
 */
function validateLocation() {
    const provinsi = document.getElementById('provinsi'); // Mengambil elemen dropdown provinsi
    const kota_kabupaten = document.getElementById('kota_kabupaten'); // Mengambil elemen dropdown kota/kabupaten
    let isValid = true; // Status validasi lokasi

    // Validasi provinsi
    if (!provinsi.value) {
        provinsi.classList.add('input-error'); // Menambahkan kelas error jika provinsi tidak dipilih
        showFieldErrorMessage(provinsi, 'Provinsi harus dipilih'); // Menampilkan pesan error
        isValid = false; // Set isValid ke false
    } else {
        provinsi.classList.remove('input-error'); // Menghapus kelas error jika provinsi valid
        hideFieldErrorMessage(provinsi); // Menyembunyikan pesan error
    }

    // Validasi kota_kabupaten hanya jika provinsi sudah dipilih
    if (provinsi.value && !kota_kabupaten.value) {
        kota_kabupaten.classList.add('input-error'); // Menambahkan kelas error jika kota/kabupaten tidak dipilih
        showFieldErrorMessage(kota_kabupaten, 'Kota/Kabupaten harus dipilih'); // Menampilkan pesan error
        isValid = false; // Set isValid ke false
    } else if (kota_kabupaten.value) {
        kota_kabupaten.classList.remove('input-error'); // Menghapus kelas error jika kota/kabupaten valid
        hideFieldErrorMessage(kota_kabupaten); // Menyembunyikan pesan error
    }

    return isValid; // Mengembalikan status validasi lokasi
}

/**
 * Menampilkan notifikasi error global
 * @param {string} message - Pesan error yang akan ditampilkan
 */
function showGlobalErrorNotification(message) {
    // Buat atau dapatkan container notifikasi
    let notificationContainer = document.getElementById('global-notification'); // Mengambil elemen notifikasi global
    if (!notificationContainer) {
        notificationContainer = document.createElement('div'); // Membuat elemen div untuk notifikasi
        notificationContainer.id = 'global-notification'; // Menetapkan ID untuk notifikasi
        notificationContainer.style.position = 'fixed'; // Mengatur posisi notifikasi
        notificationContainer.style.top = '20px'; // Mengatur jarak dari atas
        notificationContainer.style.left = '50%'; // Mengatur jarak dari kiri
        notificationContainer.style.transform = 'translateX(-50%)'; // Mengatur posisi tengah
        notificationContainer.style.backgroundColor = '#dc3545'; // Mengatur warna latar belakang
        notificationContainer.style.color = 'white'; // Mengatur warna teks
        notificationContainer.style.padding = '10px 20px'; // Mengatur padding
        notificationContainer.style.borderRadius = '5px'; // Mengatur sudut
        notificationContainer.style.zIndex = '1000'; // Mengatur z-index
        document.body.appendChild(notificationContainer); // Menambahkan notifikasi ke body
    }

    // Atur pesan
    notificationContainer.textContent = message; // Menambahkan pesan ke notifikasi

    // Tampilkan notifikasi
    notificationContainer.style.display = 'block'; // Menampilkan notifikasi

    // Sembunyikan notifikasi setelah beberapa detik
    setTimeout(() => {
        notificationContainer.style.display = 'none'; // Menyembunyikan notifikasi setelah 3 detik
    }, 3000);
}

/**
    Menginisialisasi lokasi (Provinsi, Kota/Kabupaten)
 */
/**
 * Menginisialisasi dropdown lokasi dengan animasi smooth
 */
function initLocationDropdown() {
    const provinsiSelect = document.getElementById('provinsi'); // Mengambil elemen dropdown provinsi
    const kota_kabupatenSelect = document.getElementById('kota_kabupaten'); // Mengambil elemen dropdown kota/kabupaten
    const citySelectionGroup = document.getElementById('citySelectionGroup'); // Mengambil elemen grup pemilihan kota

    // Muat data lokasi dari JSON
    fetch('/data/lokasi_indonesia') // Mengambil data lokasi dari server
        .then(response => response.json()) // Mengonversi response menjadi JSON
        .then(data => {
            // Populasi dropdown provinsi
            Object.keys(data).forEach(provinsi => {
                const option = document.createElement('option'); // Membuat elemen option untuk provinsi
                option.value = provinsi; // Menetapkan nilai option
                option.textContent = provinsi; // Menetapkan teks option
                provinsiSelect.appendChild(option); // Menambahkan option ke dropdown provinsi
            });

            // Event listener untuk perubahan provinsi
            provinsiSelect.addEventListener('change', function () {
                const selectedProvinsi = this.value; // Mengambil provinsi yang dipilih

                // Reset dropdown kota_kabupaten
                kota_kabupatenSelect.innerHTML = '<option value="" selected disabled>Pilih Kota/Kabupaten</option>'; // Mengatur ulang dropdown kota/kabupaten

                if (selectedProvinsi) {
                    // Tampilkan dropdown kota_kabupaten dengan animasi
                    citySelectionGroup.style.display = 'block'; // Menampilkan grup pemilihan kota
                    setTimeout(() => {
                        citySelectionGroup.classList.add('active'); // Menambahkan kelas aktif untuk animasi
                    }, 10);

                    // Populasi dropdown kota/kabupaten
                    data[selectedProvinsi].forEach(kota_kabupaten => {
                        const option = document.createElement('option'); // Membuat elemen option untuk kota/kabupaten
                        option.value = kota_kabupaten; // Menetapkan nilai option
                        option.textContent = kota_kabupaten; // Menetapkan teks option
                        kota_kabupatenSelect.appendChild(option); // Menambahkan option ke dropdown kota/kabupaten
                    });
                } else {
                    // Sembunyikan dropdown kota_kabupaten jika tidak ada provinsi dipilih
                    citySelectionGroup.classList.remove('active'); // Menghapus kelas aktif
                    setTimeout(() => {
                        citySelectionGroup.style.display = 'none'; // Menyembunyikan grup pemilihan kota
                    }, 300);
                }
            });

            // Event listener untuk validasi saat memilih kota/kabupaten
            kota_kabupatenSelect.addEventListener('change', function () {
                validateField(this); // Memvalidasi field kota/kabupaten saat dipilih
            });
        })
        .catch(error => {
            console.error('Error loading location data:', error); // Menampilkan error jika gagal memuat data
        });
}

/**
    Menginisialisasi kalkulator BMI (Body Mass Index)
 */
function initBMICalculator() {
    const heightInput = document.getElementById('height'); // Mengambil elemen input tinggi
    const weightInput = document.getElementById('weight'); // Mengambil elemen input berat
    const bmiValue = document.getElementById('bmiValue'); // Mengambil elemen untuk menampilkan nilai BMI
    const bmiInput = document.getElementById('bmi'); // Mengambil elemen input untuk menyimpan nilai BMI
    const bmiCategory = document.getElementById('bmiCategory'); // Mengambil elemen untuk menampilkan kategori BMI

    if (heightInput && weightInput) {
        // Fungsi untuk menghitung BMI berdasarkan input tinggi dan berat
        function calculateBMI() {
            const height = parseFloat(heightInput.value) / 100; // Konversi cm ke meter
            const weight = parseFloat(weightInput.value); // Mengambil nilai berat

            if (height > 0 && weight > 0) {
                const bmi = weight / (height * height); // Menghitung BMI
                bmiValue.textContent = bmi.toFixed(1); // Menampilkan nilai BMI
                bmiInput.value = bmi.toFixed(1); // Menyimpan nilai BMI ke input

                // Mengupdate kategori BMI
                if (bmi < 18.5) {
                    bmiCategory.textContent = 'Kurus'; // Kategori untuk BMI kurang dari 18.5
                    bmiCategory.className = 'result-category underweight'; // Menambahkan kelas untuk styling
                } else if (bmi < 25) {
                    bmiCategory.textContent = 'Normal'; // Kategori untuk BMI antara 18.5 dan 24.9
                    bmiCategory.className = 'result-category normal'; // Menambahkan kelas untuk styling
                } else if (bmi < 30) {
                    bmiCategory.textContent = 'Berat Badan Berlebih'; // Kategori untuk BMI antara 25 dan 29.9
                    bmiCategory.className = 'result-category overweight'; // Menambahkan kelas untuk styling
                } else {
                    bmiCategory.textContent = 'Obesitas'; // Kategori untuk BMI 30 ke atas
                    bmiCategory.className = 'result-category obese'; // Menambahkan kelas untuk styling
                }
            }
        }

        // Menambahkan event listener untuk perhitungan BMI
        heightInput.addEventListener('input', calculateBMI); // Menghitung BMI saat input tinggi berubah
        weightInput.addEventListener('input', calculateBMI); // Menghitung BMI saat input berat berubah

        // Menghitung BMI saat pertama kali
        calculateBMI(); // Memanggil fungsi untuk menghitung BMI
        console.log('Kalkulator BMI diinisialisasi'); // Menampilkan pesan di console
    }
}

/**
    Menginisialisasi fungsi perhitungan Diabetes Pedigree Function (DPF)
    yang menghitung faktor risiko diabetes berdasarkan riwayat keluarga
*/
function initDiabetesPedigreeFunction() {
    // Inisialisasi tombol counter untuk riwayat keluarga
    const counterBtns = document.querySelectorAll('.counter-btn'); // Mengambil semua tombol counter

    counterBtns.forEach(btn => {
        btn.addEventListener('click', function () {
            const type = this.dataset.type; // Mengambil tipe dari data atribut
            const action = this.dataset.action; // Mengambil aksi dari data atribut
            const counterElement = document.getElementById(`${type}Counter`); // Mengambil elemen counter berdasarkan tipe

            let count = parseInt(counterElement.textContent); // Mengambil nilai counter

            if (action === 'increment') {
                count++; // Menambah nilai counter
            } else if (action === 'decrement' && count > 0) {
                count--; // Mengurangi nilai counter jika lebih dari 0
            }

            counterElement.textContent = count; // Memperbarui nilai counter
            calculateDPF(); // Menghitung ulang DPF
        });
    });

    // Fungsi untuk menghitung nilai DPF berdasarkan input
    window.calculateDPF = function () {
        const father = document.getElementById('father').checked ? 0.5 : 0; // Mengambil nilai dari checkbox ayah
        const mother = document.getElementById('mother').checked ? 0.5 : 0; // Mengambil nilai dari checkbox ibu

        const siblings = parseInt(document.getElementById('siblingCounter').textContent) * 0.3; // Menghitung nilai dari jumlah saudara
        const grandparents = parseInt(document.getElementById('grandparentCounter'). textContent) * 0.2; // Menghitung nilai dari jumlah kakek/nenek
        const relatives = parseInt(document.getElementById('relativeCounter').textContent) * 0.1; // Menghitung nilai dari jumlah kerabat

        const dpf = father + mother + siblings + grandparents + relatives; // Menghitung total DPF
        const dpfFormatted = dpf.toFixed(3); // Membulatkan nilai DPF hingga 3 desimal

        document.getElementById('dpfValue').textContent = dpfFormatted; // Menampilkan nilai DPF
        document.getElementById('diabetesPedigreeFunction').value = dpfFormatted; // Menyimpan nilai DPF ke input
    };

    // Menghitung DPF saat pertama kali
    calculateDPF(); // Memanggil fungsi untuk menghitung DPF
    console.log('Fungsi perhitungan DPF diinisialisasi'); // Menampilkan pesan di console
}

/**
    Menginisialisasi progress bar form yang menunjukkan seberapa banyak
    data yang sudah diisi oleh pengguna
*/
function initFormProgress() {
    const formInputs = document.querySelectorAll('#healthForm input[type="number"]'); // Mengambil semua input numerik dalam form
    const formProgress = document.getElementById('formProgress'); // Mengambil elemen progress bar

    function updateFormProgress() {
        let filledInputs = 0; // Menghitung jumlah input yang terisi
        formInputs.forEach(input => {
            if (input.value && input.value !== '0') {
                filledInputs++; // Menambah jumlah input yang terisi
            }
        });

        const progressPercentage = (filledInputs / formInputs.length) * 100; // Menghitung persentase progress
        formProgress.style.width = `${progressPercentage}%`; // Mengatur lebar progress bar
    }

    formInputs.forEach(input => {
        input.addEventListener('input', updateFormProgress); // Menambahkan event listener untuk memperbarui progress saat input berubah
    });

    // Update progress bar saat pertama kali
    updateFormProgress(); // Memanggil fungsi untuk memperbarui progress bar
    console.log('Progress form diinisialisasi'); // Menampilkan pesan di console
}

/**
    Menginisialisasi tombol reset untuk mengembalikan form ke kondisi awal
*/
function initResetButton() {
    const resetBtn = document.getElementById('resetBtn'); // Mengambil elemen tombol reset

    if (resetBtn) {
        resetBtn.addEventListener('click', function () {
            // Reset form dan semua input fields
            const healthForm = document.getElementById('healthForm'); // Mengambil elemen form kesehatan
            healthForm.reset(); // Mengatur ulang form

            // Reset counter keluarga secara manual
            document.getElementById('siblingCounter').textContent = '0'; // Mengatur ulang counter saudara
            document.getElementById('grandparentCounter').textContent = '0'; // Mengatur ulang counter kakek/nenek
            document.getElementById('relativeCounter').textContent = '0'; // Mengatur ulang counter kerabat

            // Reset checkbox untuk riwayat keluarga
            document.getElementById('father').checked = false; // Mengatur ulang checkbox ayah
            document.getElementById('mother').checked = false; // Mengatur ulang checkbox ibu

            // Reset semua input field secara manual untuk memastikan
            const inputFields = [
                'pregnancies', 'glucose', 'bloodPressure',
                'height', 'weight', 'bmi', 'age'
            ]; // Daftar input field yang akan direset

            inputFields.forEach(fieldId => {
                const field = document.getElementById(fieldId); // Mengambil elemen input berdasarkan ID
                if (field) {
                    field.value = ''; // Mengatur ulang nilai input
                }
            });

            // Reset progress bar
            const formProgress = document.getElementById('formProgress'); // Mengambil elemen progress bar
            if (formProgress) {
                formProgress.style.width = '0%'; // Mengatur ulang lebar progress bar
            }

            // Reset elemen-elemen hasil
            const resultCard = document.querySelector('.result-card'); // Mengambil elemen kartu hasil
            if (resultCard) {
                resultCard.style.display = 'none'; // Menyembunyikan kartu hasil

                // Reset isi konten result card
                document.getElementById('resultTitle').textContent = ''; // Mengatur ulang judul hasil
                document.getElementById('resultDescription').innerHTML = ''; // Mengatur ulang deskripsi hasil
                document.getElementById('keyFactors').innerHTML = ''; // Mengatur ulang faktor kunci

                // Reset warna dan ikon
                const resultIcon = document.getElementById('resultIcon'); // Mengambil elemen ikon hasil
                if (resultIcon) {
                    resultIcon.className = "fas fa-heart"; // Mengatur ulang kelas ikon
                    resultIcon.style.color = ""; // Kembalikan ke warna default
                }
            }

            // Menghitung ulang BMI dan DPF
            calculateBMI(); // Memanggil fungsi untuk menghitung BMI
            calculateDPF(); // Memanggil fungsi untuk menghitung DPF

            // Menghapus diagram feature importance jika ada
            const featureImportanceChart = document.getElementById('featureImportanceChart'); // Mengambil elemen diagram feature importance
            if (featureImportanceChart) {
                featureImportanceChart.remove(); // Menghapus diagram jika ada
            }

            console.log('Form dan result card direset secara menyeluruh'); // Menampilkan pesan di console
        });
        console.log('Tombol reset diinisialisasi'); // Menampilkan pesan di console
    } else {
        console.error('Tombol reset tidak ditemukan dalam DOM'); // Menampilkan error jika tombol reset tidak ditemukan
    }
}

/**
    Menginisialisasi fitur prediksi diabetes berdasarkan input pengguna
*/
function initPredictionFeature() {
    const predictBtn = document.getElementById('predictBtn'); // Mengambil elemen tombol prediksi
    const resultCard = document.getElementById('resultCard'); // Mengambil elemen kartu hasil
    const closeResultBtn = document.getElementById('closeResultBtn'); // Mengambil elemen tombol tutup hasil

    if (predictBtn) {
        predictBtn.addEventListener('click', function () {
            console.log('Tombol prediksi diklik'); // Menampilkan pesan di console

            // Validasi form sebelum melakukan prediksi
            if (!validateForm()) {
                return; // Keluar dari fungsi jika form tidak valid
            }

            // Mengumpulkan data form
            const formData = {
                pregnancies: parseInt(document.getElementById('pregnancies').value), // Mengambil nilai kehamilan
                glucose: parseInt(document.getElementById('glucose').value), // Mengambil nilai gula darah
                bloodPressure: parseInt(document.getElementById('bloodPressure').value), // Mengambil nilai tekanan darah
                bmi: parseFloat(document.getElementById('bmi').value), // Mengambil nilai BMI
                diabetesPedigreeFunction: parseFloat(document.getElementById('diabetesPedigreeFunction').value), // Mengambil nilai DPF
                age: parseInt(document.getElementById('age').value), // Mengambil nilai usia
                provinsi: document.getElementById('provinsi').value, // Mengambil nilai provinsi
                kota_kabupaten: document.getElementById('kota_kabupaten').value // Mengambil nilai kota/kabupaten
            };

            console.log('Data form dikumpulkan:', formData); // Menampilkan data form yang dikumpulkan

            // Mengirim data ke server untuk prediksi
            fetch('/predict', {
                    method: 'POST', // Menggunakan metode POST
                    headers: {
                        'Content-Type': 'application/json' // Mengatur header konten
                    },
                    body: JSON.stringify(formData) // Mengonversi data form menjadi JSON
                })
                .then(response => response.json()) // Mengonversi response menjadi JSON
                .then(data => {
                    console.log('Data prediksi diterima:', data); // Menampilkan data prediksi yang diterima

                    // Memperbarui UI dengan hasil prediksi
                    updatePredictionUI(data); // Memanggil fungsi untuk memperbarui UI dengan hasil

                    // Menampilkan hasil
                    resultCard.style.display = 'block'; // Menampilkan kartu hasil

                    // Scroll ke hasil secara otomatis
                    resultCard.scrollIntoView({
                        behavior: 'smooth', // Mengatur perilaku scroll
                        block: 'start' // Mengatur posisi scroll
                    });
                })
                .catch(error => {
                    console.error('Error saat melakukan prediksi:', error); // Menampilkan error jika terjadi kesalahan
                    alert('Terjadi kesalahan saat memproses prediksi. Silakan coba lagi.'); // Menampilkan alert kesalahan
                });
        });
        console.log('Tombol prediksi diinisialisasi'); // Menampilkan pesan di console
    } else {
        console.error('Tombol prediksi tidak ditemukan dalam DOM'); // Menampilkan error jika tombol prediksi tidak ditemukan
    }

    // Menambahkan fungsi untuk menutup kartu hasil
    if (closeResultBtn) {
        closeResultBtn.addEventListener('click', function () {
            resultCard.style.display = 'none'; // Menyembunyikan kartu hasil
        });
        console.log('Tombol tutup hasil diinisialisasi'); // Menampilkan pesan di console
    }
}

/**
    Memperbarui tampilan UI dengan hasil prediksi
    @param {Object} data - Data hasil prediksi dari server
*/
function updatePredictionUI(data) {
    document.getElementById('resultTitle').textContent = data.prediction; // Menampilkan judul hasil prediksi
    document.getElementById('riskIndicator').style.left = `${data.probability}%`; // Mengatur posisi indikator risiko

    // Mengubah warna ikon jantung berdasarkan prediksi
    const resultIcon = document.getElementById('resultIcon'); // Mengambil elemen ikon hasil
    if (data.prediction === "Tidak Terindikasi Diabetes") {
        // Jantung hijau untuk prediksi non-diabetes (y_pred = 0)
        resultIcon.className = "fas fa-heart"; // Mengatur kelas ikon
        resultIcon.style.color = "#28a745"; // Mengatur warna hijau
        document.querySelector('.result-card').style.borderLeftColor = "#28a745"; // Mengatur warna border kartu hasil
    } else {
        // Jantung merah untuk prediksi diabetes (y_pred = 1)
        resultIcon.className = "fas fa-heart"; // Mengatur kelas ikon
        resultIcon.style.color = "#dc3545"; // Mengatur warna merah
        document.querySelector('.result-card').style.borderLeftColor = "#dc3545"; // Mengatur warna border kartu hasil
    }

    // Mengubah warna judul hasil berdasarkan prediksi
    const resultTitle = document.getElementById('resultTitle'); // Mengambil elemen judul hasil
    if (data.prediction === "Tidak Terindikasi Diabetes") {
        resultTitle.style.color = "#28a745"; // Mengatur warna hijau untuk hasil non-diabetes
    } else {
        resultTitle.style.color = "#dc3545"; // Mengatur warna merah untuk hasil diabetes
    }

    // Menampilkan faktor risiko utama dengan highlight
    const keyFactors = document.getElementById('keyFactors'); // Mengambil elemen faktor kunci
    keyFactors.innerHTML = ''; // Mengatur ulang konten faktor kunci
    data.keyFactors.forEach(factor => {
        const li = document.createElement('li'); // Membuat elemen list untuk faktor kunci

        // Menambahkan highlight untuk nilai penting
        const factorText = factor.replace(/(\d+(\.\d+)?)/g, '<strong>$1</strong>'); // Menebalkan nilai penting
        li.innerHTML = factorText; // Menambahkan teks faktor ke elemen list

        keyFactors.appendChild(li); // Menambahkan elemen list ke faktor kunci
    });

    // Menambahkan deskripsi berdasarkan prediksi dengan probabilitas
    const resultDescription = document.getElementById('resultDescription'); // Mengambil elemen deskripsi hasil
    if (data.prediction === "Tidak Terindikasi Diabetes") {
        resultDescription.innerHTML = `<i class='fas fa-smile'></i> Good news! Dari data yang kamu kasih, risiko diabetes-nya rendah (${data.probability.toFixed(1)}%). Tetap jaga pola hidup sehat, ya!`; // Menampilkan deskripsi untuk hasil non-diabetes
    } else {
        resultDescription.innerHTML = `<i class='fas fa-exclamation-circle'></i> <strong>Perhatian!</strong> Ada indikasi risiko diabetes berdasarkan data yang kamu kasih dengan probabilitas <strong>${data.probability.toFixed(1)}%</strong>. Coba cek ke dokter buat kepastian dan saran lebih lanjut, ya!`; // Menampilkan deskripsi untuk hasil diabetes
    }

    // Membuat visualisasi feature importance jika data tersedia
    if (data.featureImportance && data.featureImportance.length > 0) {
        createFeatureImportanceChart(data.featureImportance); // Memanggil fungsi untuk membuat diagram feature importance
    }
}

/**
    Membuat diagram feature importance untuk menampilkan kontribusi
    setiap faktor terhadap hasil prediksi
    @param {Array} importanceData - Data kepentingan fitur
*/
function createFeatureImportanceChart(importanceData) {
    console.log('Membuat diagram feature importance dengan data:', importanceData); // Menampilkan data feature importance

    // Menghapus diagram lama jika ada
    const oldChart = document.getElementById('featureImportanceChart'); // Mengambil elemen diagram lama
    if (oldChart) {
        oldChart.remove(); // Menghapus diagram lama
    }

    // Membuat container untuk diagram baru
    const chartContainer = document.createElement('div'); // Membuat elemen div untuk diagram
    chartContainer.id = 'featureImportanceChart'; // Menetapkan ID untuk diagram
    chartContainer.className = 'feature-importance-chart'; // Menambahkan kelas untuk styling

    // Menambahkan judul diagram
    const chartTitle = document.createElement('h4'); // Membuat elemen h4 untuk judul
    chartTitle.textContent = 'Kontribusi Faktor Risiko'; // Menetapkan teks judul
    chartTitle.className = 'chart-title'; // Menambahkan kelas untuk styling
    chartContainer.appendChild(chartTitle); // Menambahkan judul ke container diagram

    // Transformasi nama fitur ke bahasa yang lebih user-friendly
    const featureNames = {
        'Glucose': 'Gula Darah', // Mengubah nama fitur
        'BMI': 'Indeks Massa Tubuh', // Mengubah nama fitur
        'Age': 'Usia', // Mengubah nama fitur
        'BloodPressure': 'Tekanan Darah', // Mengubah nama fitur
        'DiabetesPedigreeFunction': 'Riwayat Keluarga', // Mengubah nama fitur
        'Pregnancies': 'Jumlah Kehamilan' // Mengubah nama fitur
    };

    // Membuat representasi visual untuk setiap faktor
    importanceData.forEach(item => {
        // Membuat container untuk baris
        const barContainer = document.createElement('div'); // Membuat elemen div untuk bar
        barContainer.className = 'importance-bar-container'; // Menambahkan kelas untuk styling

        // Label untuk fitur
        const label = document.createElement('div'); // Membuat elemen div untuk label
        label.className = 'importance-label'; // Menambahkan kelas untuk styling
        label.textContent = featureNames[item.feature] || item.feature; // Menetapkan teks label
        barContainer.appendChild(label); // Menambahkan label ke bar container

        // Container untuk bar dan nilai
        const barWrapper = document.createElement('div'); // Membuat elemen div untuk wrapper bar
        barWrapper.className = 'importance-bar-wrapper'; // Menambahkan kelas untuk styling

        // Bar untuk visualisasi
        const bar = document.createElement('div'); // Membuat elemen div untuk bar
        bar.className = 'importance-bar'; // Menambahkan kelas untuk styling
        bar.style.width = `${item.importance}%`; // Mengatur lebar bar berdasarkan nilai kepentingan

        // Menentukan warna berdasarkan importance
        bar.style.backgroundColor = getImportanceColor(item.importance); // Mengatur warna bar berdasarkan nilai kepentingan

        barWrapper.appendChild(bar); // Menambahkan bar ke wrapper
        // Nilai persentase
        const value = document.createElement('span'); // Membuat elemen span untuk nilai
        value.className = 'importance-value'; // Menambahkan kelas untuk styling
        value.textContent = `${item.importance}%`; // Menetapkan teks nilai
        barWrapper.appendChild(value); // Menambahkan nilai ke wrapper

        barContainer.appendChild(barWrapper); // Menambahkan wrapper ke bar container
        chartContainer.appendChild(barContainer); // Menambahkan bar container ke diagram
    });

    // Menambahkan keterangan untuk interpretasi
    const legend = document.createElement('div'); // Membuat elemen div untuk legend
    legend.className = 'importance-legend'; // Menambahkan kelas untuk styling
    legend.innerHTML = '<small><i class="fas fa-info-circle"></i> Persentase menunjukkan seberapa besar pengaruh faktor tersebut terhadap hasil prediksi.</small>'; // Menetapkan teks legend
    chartContainer.appendChild(legend); // Menambahkan legend ke diagram

    // Menambahkan ke DOM
    const keyFactorsContainer = document.getElementById('keyFactors').parentNode; // Mengambil elemen parent dari faktor kunci
    keyFactorsContainer.after(chartContainer); // Menambahkan diagram setelah elemen faktor kunci

    console.log('Diagram feature importance dibuat'); // Menampilkan pesan di console
}

/**
    Mendapatkan warna berdasarkan nilai kepentingan fitur
    @param {Number} importance - Nilai kepentingan (0-100)
    @returns {String} - Kode warna dalam format hex
*/
function getImportanceColor(importance) {
    if (importance > 50) {
        return '#dc3545'; // Merah untuk sangat penting
    } else if (importance > 25) {
        return '#fd7e14'; // Orange untuk penting
    } else if (importance > 10) {
        return '#ffc107'; // Kuning untuk cukup penting
    } else {
        return '#28a745'; // Hijau untuk kurang penting
    }
}

/**
    Menginisialisasi fungsi toggle FAQ (Frequently Asked Questions)
*/
function initFAQToggle() {
    const faqItems = document.querySelectorAll('.faq-item'); // Mengambil semua elemen FAQ

    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question'); // Mengambil elemen pertanyaan dari item FAQ

        question.addEventListener('click', () => {
            // Menutup item FAQ lain yang terbuka
            faqItems.forEach(otherItem => {
                if (otherItem !== item && otherItem.classList.contains('active')) {
                    otherItem.classList.remove('active'); // Menghapus kelas aktif dari item lain
                }
            });

            // Toggle item FAQ saat ini
            item.classList.toggle('active'); // Mengubah kelas aktif pada item yang diklik
        });
    });

    console.log('Toggle FAQ diinisialisasi'); // Menampilkan pesan di console
}
