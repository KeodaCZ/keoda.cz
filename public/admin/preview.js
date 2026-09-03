/**
 * Custom preview pane for the schedule exceptions.
 *
 * Styled after the site's own calendar rows, so what you see here is roughly
 * what visitors get: date badge, title, accent time on the right. The built-in
 * preview listed every field one per line on a white background, which matched
 * neither the site nor the dark admin around it.
 *
 * `createClass` and `h` are globals provided by the CMS, so no React script is
 * needed. Presentation only — no scheduling rules are reimplemented here,
 * because a second copy would drift from src/lib/schedule-core.ts.
 */
(function () {
  var WEEKDAYS = ['NE', 'PO', 'ÚT', 'ST', 'ČT', 'PÁ', 'SO'];

  // The site's palette. The preview iframe supplies its own defaults —
  // including a white page and a serif face — so everything is stated here.
  var INK = '#131108';
  var CARD = '#1d1a0e';
  var TEXT = '#ded7b4';
  var MUTED = '#8f8968';
  var ACCENT = '#f2dc5a';
  var EDGE = 'rgba(242, 220, 90, 0.18)';
  var FONT =
    'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

  /** Czech counts split three ways: 1, 2-4, and 5+. */
  function plural(count, one, few, many) {
    if (count === 1) return one;
    if (count >= 2 && count <= 4) return few;
    return many;
  }

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

  /** 'YYYY-MM-DD' -> '4. 9.', matching how the site writes dates. */
  function shortDate(iso) {
    var parts = String(iso || '').split('-');
    if (parts.length !== 3) return iso ? String(iso) : '?';
    return Number(parts[2]) + '. ' + Number(parts[1]) + '.';
  }

  function el(tag, style, children) {
    return h(tag, { style: style }, children);
  }

  function badge(date, weekday, cancelled) {
    return el(
      'div',
      {
        flex: 'none',
        minWidth: '54px',
        padding: '5px 6px',
        border: '1px solid ' + EDGE,
        borderRadius: '7px',
        textAlign: 'center',
        opacity: cancelled ? '0.6' : '1',
      },
      [
        el(
          'div',
          { fontSize: '15px', fontWeight: '700', lineHeight: '1.1', letterSpacing: '0.02em' },
          shortDate(date)
        ),
        el(
          'div',
          { fontSize: '9px', letterSpacing: '0.14em', color: MUTED, marginTop: '1px' },
          weekday || '—'
        ),
      ]
    );
  }

  function row(entry, index, duplicated, isPast) {
    var cancelled = entry.status === 'off';
    var title = cancelled ? 'Nestreamuju' : entry.game || 'Stream';
    var timeIsPattern = !cancelled && !entry.timeUnknown && !entry.start;
    // Never restate the recurring time here: it lives in data/schedule.json,
    // and a copy in the admin would go stale without anyone noticing.
    var time = cancelled || entry.timeUnknown ? '—' : timeIsPattern ? 'pravidelný' : entry.start;

    var right = [
      el(
        'div',
        {
          fontSize: timeIsPattern ? '12px' : '17px',
          fontWeight: '700',
          lineHeight: '1',
          color: cancelled || entry.timeUnknown || timeIsPattern ? MUTED : ACCENT,
        },
        time
      ),
    ];
    if (entry.timeUnknown) {
      right.push(
        el('div', { fontSize: '9px', letterSpacing: '0.1em', color: MUTED, marginTop: '2px' }, 'ČAS NEVÍM')
      );
    }

    var middle = [
      el(
        'div',
        {
          fontSize: '13px',
          fontWeight: '700',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          textDecoration: cancelled ? 'line-through' : 'none',
          color: cancelled ? MUTED : TEXT,
        },
        title
      ),
    ];
    if (entry.note) {
      middle.push(el('div', { fontSize: '12px', color: MUTED, marginTop: '2px' }, entry.note));
    }
    if (entry.highlight) {
      middle.push(
        el(
          'div',
          { marginTop: '4px' },
          el(
            'span',
            {
              display: 'inline-block',
              padding: '1px 6px',
              borderRadius: '999px',
              border: '1px solid ' + ACCENT,
              color: ACCENT,
              fontSize: '9px',
              fontWeight: '700',
              letterSpacing: '0.1em',
            },
            'V BANNERU'
          )
        )
      );
    }

    return h(
      'div',
      {
        // Stable key: a random one would remount the row on every keystroke.
        key: index + ':' + (entry.date || index),
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '8px 10px',
          marginBottom: '7px',
          border: '1px solid ' + (duplicated ? '#e8735f' : EDGE),
          borderRadius: '9px',
          background: CARD,
          opacity: isPast ? '0.45' : '1',
        },
      },
      [
        badge(entry.date, weekdayOf(entry.date), cancelled),
        el('div', { flex: '1 1 auto', minWidth: '0' }, middle),
        el('div', { flex: 'none', textAlign: 'right' }, right),
      ]
    );
  }

  function note(text, tone) {
    return h(
      'p',
      {
        style: {
          display: 'flex',
          gap: '6px',
          margin: '9px 0 0',
          fontSize: '11.5px',
          lineHeight: '1.5',
          color: tone === 'warn' ? '#e8735f' : MUTED,
        },
      },
      [el('span', { flex: 'none' }, tone === 'warn' ? '⚠' : '·'), el('span', {}, text)]
    );
  }

  var previewSpec = {
    render: function () {
      var entries;
      try {
        entries = toArray(this.props.entry.getIn(['data', 'exceptions']));
      } catch (error) {
        entries = null;
      }

      var wrap = function (children) {
        return h(
          'div',
          {
            style: {
              minHeight: '100vh',
              margin: '0',
              padding: '16px 18px',
              background: INK,
              color: TEXT,
              fontFamily: FONT,
              fontSize: '13px',
            },
          },
          children
        );
      };

      if (entries === null) {
        return wrap(el('p', { margin: '0', color: MUTED }, 'Náhled se nepodařilo načíst.'));
      }

      if (entries.length === 0) {
        return wrap(
          el(
            'p',
            { margin: '0', color: MUTED, lineHeight: '1.5' },
            'Žádné výjimky — platí pravidelný rozvrh. To je normální stav.'
          )
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
        el(
          'p',
          {
            margin: '0 0 11px',
            fontSize: '10px',
            fontWeight: '700',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: MUTED,
          },
          entries.length + ' ' + plural(entries.length, 'výjimka', 'výjimky', 'výjimek')
        ),
        h(
          'div',
          { key: 'rows' },
          entries.map(function (entry, index) {
            var safe = entry || {};
            return row(
              safe,
              index,
              Boolean(safe.date && counts[safe.date] > 1),
              Boolean(safe.date && safe.date < today)
            );
          })
        ),
      ];

      if (duplicates.length > 0) {
        children.push(
          note(
            'Dvě výjimky na stejné datum (' +
              duplicates.join(', ') +
              '). Web je sloučí do jedné, pozdější údaje přebijí dřívější — nech u každého dne jen jeden záznam.',
            'warn'
          )
        );
      }
      if (pastCount > 0) {
        children.push(
          note(
            pastCount +
              ' ' +
              plural(pastCount, 'výjimka je', 'výjimky jsou', 'výjimek je') +
              ' v minulosti, na webu ' +
              plural(pastCount, 'se už nezobrazuje', 'se už nezobrazují', 'se už nezobrazuje') +
              '. ' +
              plural(pastCount, 'Můžeš ji smazat.', 'Můžeš je smazat.', 'Můžeš je smazat.')
          )
        );
      }
      children.push(
        note('„V banneru“ je jen ruční zaškrtnutí — zrušený stream, jiný čas a nejistý čas se v banneru objeví i bez něj.')
      );

      return wrap(children);
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

  // The CMS defines these synchronously in practice, but poll briefly rather
  // than silently doing nothing if it ever loads later.
  if (!register()) {
    var tries = 0;
    var timer = setInterval(function () {
      tries += 1;
      if (register() || tries > 50) clearInterval(timer);
    }, 100);
  }
})();
