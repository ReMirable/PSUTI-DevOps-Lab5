
import { useEffect, useState } from 'react'
import './App.css'

const formatter = new Intl.DateTimeFormat('ru-RU', {
  dateStyle: 'full',
  timeStyle: 'short',
  timeZone: 'Europe/Moscow',
})

// Backend работает с датами, содержащими часовой пояс.
// Для Казани используем московское время UTC+3.
function toKazanISO(date) {
  const shifted = new Date(date.getTime() + 3 * 60 * 60 * 1000)
  return shifted.toISOString().slice(0, 19) + '+03:00'
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, options)
  const data = await response.json()

  if (!response.ok) {
    throw new Error(
      data.error?.message || `Ошибка HTTP ${response.status}`
    )
  }

  return data
}

function App() {
  const [form, setForm] = useState({
    title: '',
    description: '',
    date: '',
    time: '12:00',
    interval: '7',
    unit: 'days',
    count: '4',
    duration: '60',
    artistId: '',
    venueId: '',
    genreCode: '',
    price: '0',
    ageRating: '0',
    ticketQuota: '20',
    status: 'draft',
  })

  const [catalogs, setCatalogs] = useState({
    artists: [],
    venues: [],
    genres: [],
  })

  const [preview, setPreview] = useState(null)
  const [requestKey, setRequestKey] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let active = true

    async function loadCatalogs() {
      try {
        const [artists, venues, genres] = await Promise.all([
          apiRequest('/api/v1/artists?page_size=100'),
          apiRequest('/api/v1/venues?page_size=100'),
          apiRequest('/api/v1/meta/genres'),
        ])

        if (active) {
          setCatalogs({
            artists: artists.data,
            venues: venues.data,
            genres: genres.data,
          })
        }
      } catch (err) {
        if (active) {
          setError('Не удалось загрузить справочники: ' + err.message)
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    loadCatalogs()

    return () => {
      active = false
    }
  }, [])

  function updateField(field, value) {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }))

    setPreview(null)
    setRequestKey('')
    setSaved(false)
    setError('')
  }

  const selectedVenue = catalogs.venues.find(
    (venue) => venue.id === form.venueId
  )

  async function generateSchedule(event) {
    event.preventDefault()
    setChecking(true)
    setError('')
    setPreview(null)
    setSaved(false)

    try {
      const count = Number(form.count)
      const interval = Number(form.interval)
      const duration = Number(form.duration)
      const quota = Number(form.ticketQuota)
      const price = Number(form.price)

      const days = interval * (form.unit === 'weeks' ? 7 : 1)

      const start = new Date(
        `${form.date}T${form.time}:00+03:00`
      )

      if (!form.title.trim() || form.title.trim().length > 250) {
        throw new Error('Название должно содержать от 1 до 250 символов')
      }

      if (!form.artistId || !form.venueId || !form.genreCode) {
        throw new Error('Выберите исполнителя, площадку и жанр')
      }

      if (!Number.isFinite(start.getTime())) {
        throw new Error('Укажите корректную дату и время')
      }

      if (!Number.isInteger(count) || count < 1 || count > 100) {
        throw new Error('Количество должно быть от 1 до 100')
      }

      if (!Number.isInteger(interval) || interval < 1 || interval > 365) {
        throw new Error('Интервал должен быть от 1 до 365')
      }

      if (!Number.isInteger(duration) || duration < 1 || duration > 1440) {
        throw new Error('Продолжительность должна быть от 1 до 1440 минут')
      }

      if (!Number.isInteger(price) || price < 0) {
        throw new Error('Цена должна быть неотрицательным целым числом')
      }

      if (
        !Number.isInteger(quota) ||
        quota < 1 ||
        (selectedVenue && quota > selectedVenue.capacity)
      ) {
        throw new Error('Количество билетов превышает вместимость площадки')
      }

      const events = Array.from({ length: count }, (_, index) => {
        const begins = new Date(
          start.getTime() + index * days * 24 * 60 * 60 * 1000
        )
        const ends = new Date(begins.getTime() + duration * 60 * 1000)

        return {
          title: form.title.trim(),
          description: form.description.trim() || null,
          artist_id: form.artistId,
          venue_id: form.venueId,
          genre_code: form.genreCode,
          starts_at: toKazanISO(begins),
          ends_at: toKazanISO(ends),
          price_rub: price,
          age_rating: Number(form.ageRating),
          ticket_quota: quota,
          status: form.status,
        }
      })

      const operations = events.map((fields) => ({
        op: 'create',
        fields,
      }))

      // Проверяем пакет на сервере без записи в БД.
      const result = await apiRequest('/api/v1/events/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dry_run: true,
          operations,
        }),
      })

      if (result.errors.length > 0 || result.created !== count) {
        const firstError = result.errors[0]
        throw new Error(
          firstError
            ? `Событие №${firstError.operation_index + 1}: ${firstError.message}`
            : 'Не все события прошли проверку'
        )
      }

      setPreview({ events, operations })
      setRequestKey(crypto.randomUUID())
    } catch (err) {
      setError(err.message)
    } finally {
      setChecking(false)
    }
  }

  async function saveEvents() {
    if (!preview || !requestKey || saving || saved) return

    setSaving(true)
    setError('')

    try {
      const result = await apiRequest('/api/v1/events/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': requestKey,
        },
        body: JSON.stringify({
          dry_run: false,
          operations: preview.operations,
        }),
      })

      if (
        result.errors.length > 0 ||
        result.created !== preview.events.length
      ) {
        throw new Error('Не все события удалось сохранить')
      }

      setSaved(true)
    } catch (err) {
      setError('Ошибка сохранения: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="page">
      <div className="container">
        <header className="header">
          <span className="eyebrow">DEVOPS · ЛАБОРАТОРНАЯ №5</span>
          <h1>Календарь событий</h1>
          <p>
            Создание повторяющихся мероприятий по шаблону
            с предварительным просмотром расписания.
          </p>
        </header>

        <section className="card">
          <h2>Создать событие</h2>

          {loading && <p>Загрузка справочников...</p>}

          <form onSubmit={generateSchedule}>
            <label>
              Название события
              <input
                value={form.title}
                onChange={(e) => updateField('title', e.target.value)}
                placeholder="Занятие по программированию"
                maxLength="250"
                required
              />
            </label>

            <label>
              Описание
              <textarea
                value={form.description}
                onChange={(e) => updateField('description', e.target.value)}
                rows="3"
              />
            </label>

            <div className="grid">
              <label>
                Исполнитель
                <select
                  value={form.artistId}
                  onChange={(e) => updateField('artistId', e.target.value)}
                  required
                >
                  <option value="">Выберите исполнителя</option>
                  {catalogs.artists.map((artist) => (
                    <option key={artist.id} value={artist.id}>
                      {artist.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Площадка
                <select
                  value={form.venueId}
                  onChange={(e) => updateField('venueId', e.target.value)}
                  required
                >
                  <option value="">Выберите площадку</option>
                  {catalogs.venues.map((venue) => (
                    <option key={venue.id} value={venue.id}>
                      {venue.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {selectedVenue && (
              <p className="hint">
                Вместимость площадки: {selectedVenue.capacity} мест
              </p>
            )}

            <div className="grid">
              <label>
                Жанр
                <select
                  value={form.genreCode}
                  onChange={(e) => updateField('genreCode', e.target.value)}
                  required
                >
                  <option value="">Выберите жанр</option>
                  {catalogs.genres.map((genre) => (
                    <option key={genre.code} value={genre.code}>
                      {genre.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Возрастная категория
                <select
                  value={form.ageRating}
                  onChange={(e) => updateField('ageRating', e.target.value)}
                >
                  {[0, 6, 12, 16, 18].map((age) => (
                    <option key={age} value={age}>{age}+</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid">
              <label>
                Цена билета (руб.)
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.price}
                  onChange={(e) => updateField('price', e.target.value)}
                  required
                />
              </label>

              <label>
                Количество билетов
                <input
                  type="number"
                  min="1"
                  step="1"
                  max={selectedVenue?.capacity}
                  value={form.ticketQuota}
                  onChange={(e) => updateField('ticketQuota', e.target.value)}
                  required
                />
              </label>
            </div>

            <div className="grid">
              <label>
                Дата первого события
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => updateField('date', e.target.value)}
                  required
                />
              </label>

              <label>
                Время начала
                <input
                  type="time"
                  value={form.time}
                  onChange={(e) => updateField('time', e.target.value)}
                  required
                />
              </label>
            </div>

            <label>
              Продолжительность события (минут)
              <input
                type="number"
                min="1"
                max="1440"
                value={form.duration}
                onChange={(e) => updateField('duration', e.target.value)}
                required
              />
            </label>

            <h3>Настройки повторения</h3>

            <div className="grid">
              <label>
                Интервал
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={form.interval}
                  onChange={(e) => updateField('interval', e.target.value)}
                  required
                />
              </label>

              <label>
                Единица интервала
                <select
                  value={form.unit}
                  onChange={(e) => updateField('unit', e.target.value)}
                >
                  <option value="days">Дни</option>
                  <option value="weeks">Недели</option>
                </select>
              </label>
            </div>

            <div className="grid">
              <label>
                Количество событий
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={form.count}
                  onChange={(e) => updateField('count', e.target.value)}
                  required
                />
              </label>

              <label>
                Статус
                <select
                  value={form.status}
                  onChange={(e) => updateField('status', e.target.value)}
                >
                  <option value="draft">Черновик</option>
                  <option value="published">Опубликовано</option>
                </select>
              </label>
            </div>

            <button
              className="primary-button"
              type="submit"
              disabled={loading || checking}
            >
              {checking ? 'Проверяем...' : 'Показать расписание'}
            </button>
          </form>
        </section>

        {error && (
          <div className="card" role="alert">
            <p style={{ color: '#dc2626' }}>{error}</p>
          </div>
        )}

        {preview && (
          <section className="card preview">
            <h2>Предварительное расписание</h2>
            <p>
              Проверка API пройдена. Всего событий: {preview.events.length}
            </p>

            <div className="events-list">
              {preview.events.map((event, index) => (
                <div className="event" key={index}>
                  <span className="event-number">{index + 1}</span>
                  <div>
                    <strong>{event.title}</strong>
                    <p>
                      {formatter.format(new Date(event.starts_at))}
                      {' — '}
                      {formatter.format(new Date(event.ends_at))}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <button
              className="primary-button"
              type="button"
              onClick={saveEvents}
              disabled={saving || saved}
            >
              {saved
                ? 'События сохранены'
                : saving
                  ? 'Сохранение...'
                  : 'Сохранить события'}
            </button>

            {saved && (
              <p style={{ color: '#15803d', textAlign: 'center' }}>
                Успешно! События записаны в базу данных.
              </p>
            )}
          </section>
        )}
      </div>
    </main>
  )
}

export default App
