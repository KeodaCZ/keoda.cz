/**
 * Custom preview pane for the schedule exceptions.
 *
 * The built-in preview lists every field one per line, which is both taller
 * than the screen and less informative than the editor beside it. This shows
 * one compact row per exception instead, so the whole list — including the two
 * toggles, which the collapsed summary cannot show — is readable at a glance.
 *
 * `createClass` and `h` are globals provided by the CMS, so no React script is
 * needed. Everything here is presentation only: no scheduling rules are
 * reimplemented, because a second copy of them would drift from
 * src/lib/schedule-core.ts.
 */
(function () {
  var WEEKDAYS = ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'];

  function weekdayOf(iso) {
    var parts = String(iso || '').split('-');
    if (parts.length !== 3) return '';
    var date = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
    return isNaN(date.getTime()) ? '' : WEEKDAYS[date.getUTCDay()];
  }

  function todayIso() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Prague',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  /** Immutable.js in, plain array out — tolerant of either shape. */
  function toArray(value) {
    if (!value) return [];
    if (typeof value.toJS === 'function') {
      var plain = value.toJS();
      return Array.isArray(plain) ? plain : [];
    }
    return Array.isArray(value) ? value : [];
  }

  var CELL = {
    padding: '4px 8px',
    borderBottom: '1px solid rgba(128,128,128,.25)',
    verticalAlign: 'top',
    textAlign: 'left',
  };
  var HEAD = Object.assign({}, CELL, {
    fontWeight: '700',
    fontSize: '11px',
    letterSpacing: '.06em',
    textTransform: 'uppercase',
    opacity: '.7',
    whiteSpace: 'nowrap',
  });

  function cell(text, extra) {
    return h('td', { style: Object.assign({}, CELL, extra || {}) }, text);
  }

  function timeLabel(entry) {
    if (entry.status === 'off') return '—';
    if (entry.timeUnknown) return 'nevím';
    return entry.start ? entry.start : 'pravidelný';
  }

  function row(entry, index, duplicated, isPast) {
    var dimmed = isPast ? { opacity: '.45' } : {};
    var date = entry.date || '—';
    var weekday = weekdayOf(entry.date);

    return h(
      'tr',
      // Stable key: a random one would remount the row on every keystroke.
      { key: index + ':' + date, style: duplicated ? { background: 'rgba(220,80,80,.12)' } : {} },
      cell(weekday ? date + ' (' + weekday + ')' : date, Object.assign({ whiteSpace: 'nowrap' }, dimmed)),
      cell(entry.status === 'off' ? 'Nestreamuju' : 'Stream', Object.assign({ whiteSpace: 'nowrap' }, dimmed)),
      cell(timeLabel(entry), Object.assign({ whiteSpace: 'nowrap' }, dimmed)),
      cell(entry.game || '', dimmed),
      cell(entry.note || '', dimmed),
      cell(entry.highlight ? 'ANO' : '—', Object.assign({ whiteSpace: 'nowrap', fontWeight: entry.highlight ? '700' : '400' }, dimmed))
    );
  }

  function note(text, tone) {
    return h(
      'p',
      {
        style: {
          margin: '8px 0 0',
          fontSize: '12px',
          lineHeight: '1.45',
          color: tone === 'warn' ? '#d46' : 'inherit',
          opacity: tone === 'warn' ? '1' : '.7',
        },
      },
      text
    );
  }

  // Kept as a plain spec, not passed to createClass yet: touching that global
  // before the CMS defines it would throw and kill this whole script, including
  // the retry below.
  var previewSpec = {
    render: function () {
      var entries;
      try {
        entries = toArray(this.props.entry.getIn(['data', 'exceptions']));
      } catch (error) {
        return h('div', { style: { padding: '16px', fontSize: '13px' } }, 'Náhled se nepodařilo načíst.');
      }

      if (entries.length === 0) {
        return h(
          'div',
          { style: { padding: '16px', fontSize: '13px', opacity: '.7' } },
          'Žádné výjimky — pravidelný rozvrh platí bez změn. To je normální stav.'
        );
      }

      var today = todayIso();
      var counts = {};
      entries.forEach(function (entry) {
        if (entry && entry.date) counts[entry.date] = (counts[entry.date] || 0) + 1;
      });
      var duplicates = Object.keys(counts).filter(function (date) {
        return counts[date] > 1;
      });
      var pastCount = entries.filter(function (entry) {
        return entry && entry.date && entry.date < today;
      }).length;

      var children = [
        h(
          'p',
          { style: { margin: '0 0 10px', fontSize: '12px', opacity: '.7' } },
          entries.length === 1 ? '1 výjimka' : entries.length + ' výjimky'
        ),
        h(
          'table',
          { style: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' } },
          h(
            'thead',
            null,
            h(
              'tr',
              null,
              h('th', { style: HEAD }, 'Datum'),
              h('th', { style: HEAD }, 'Co'),
              h('th', { style: HEAD }, 'Čas'),
              h('th', { style: HEAD }, 'Hra'),
              h('th', { style: HEAD }, 'Poznámka'),
              h('th', { style: HEAD }, 'Banner')
            )
          ),
          h(
            'tbody',
            null,
            entries.map(function (entry, index) {
              var safe = entry || {};
              return row(
                safe,
                index,
                Boolean(safe.date && counts[safe.date] > 1),
                Boolean(safe.date && safe.date < today)
              );
            })
          )
        ),
      ];

      if (duplicates.length > 0) {
        children.push(
          note(
            'Pozor: dvě výjimky na stejné datum (' +
              duplicates.join(', ') +
              '). Web je sloučí do jedné, pozdější údaje přebijí dřívější — nech u každého dne jen jeden záznam.',
            'warn'
          )
        );
      }
      if (pastCount > 0) {
        children.push(
          note(
            pastCount === 1
              ? '1 výjimka je v minulosti a na webu se už nezobrazuje. Můžeš ji smazat.'
              : pastCount + ' výjimky jsou v minulosti a na webu se už nezobrazují. Můžeš je smazat.'
          )
        );
      }
      children.push(
        note('„Banner“ je jen ruční zaškrtnutí. Zrušený stream, jiný čas a nejistý čas se v banneru objeví i bez něj.')
      );

      return h('div', { style: { padding: '12px 14px' } }, children);
    },
  };

  function register() {
    if (typeof window.CMS === 'undefined') return false;
    if (typeof createClass === 'undefined' || typeof h === 'undefined') return false;
    var template = createClass(previewSpec);
    // The docs say the name is the collection or file-collection name; register
    // both so it takes effect either way.
    window.CMS.registerPreviewTemplate('kalendar', template);
    window.CMS.registerPreviewTemplate('vyjimky', template);
    return true;
  }

  // The CMS script above defines these synchronously in practice, but poll
  // briefly rather than silently doing nothing if it ever loads later.
  if (!register()) {
    var tries = 0;
    var timer = setInterval(function () {
      tries += 1;
      if (register() || tries > 50) clearInterval(timer);
    }, 100);
  }
})();
