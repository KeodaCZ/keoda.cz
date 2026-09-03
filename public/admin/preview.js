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

  // The preview iframe brings its own defaults, including a serif face, so
  // every visible style has to be stated here.
  var FONT =
    'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  var MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  var LINE = '1px solid rgba(128, 128, 128, 0.22)';
  var DIM = 'rgba(128, 128, 128, 0.9)';

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
    if (parts.length !== 3) return iso || '—';
    return Number(parts[2]) + '. ' + Number(parts[1]) + '.';
  }

  function styled(tag, style, children) {
    return h(tag, { style: style }, children);
  }

  function headCell(label, align) {
    return h(
      'th',
      {
        style: {
          padding: '0 10px 6px 0',
          borderBottom: LINE,
          textAlign: align || 'left',
          fontSize: '10px',
          fontWeight: '600',
          letterSpacing: '0.09em',
          textTransform: 'uppercase',
          color: DIM,
          whiteSpace: 'nowrap',
        },
      },
      label
    );
  }

  function bodyCell(children, extra) {
    var style = {
      padding: '7px 10px 7px 0',
      borderBottom: LINE,
      verticalAlign: 'baseline',
      textAlign: 'left',
    };
    for (var key in extra || {}) style[key] = extra[key];
    return h('td', { style: style }, children);
  }

  function row(entry, index, duplicated, isPast) {
    var date = entry.date || '';
    var weekday = weekdayOf(date);
    var fade = isPast ? '0.4' : '1';

    var dateCell = bodyCell(
      [
        styled('span', { fontFamily: MONO, fontWeight: '600', fontSize: '13px' }, shortDate(date)),
        weekday
          ? styled('span', { marginLeft: '6px', color: DIM, fontSize: '11px' }, weekday)
          : null,
      ],
      { whiteSpace: 'nowrap', opacity: fade }
    );

    var what = entry.status === 'off' ? 'Nestreamuju' : entry.game || 'Stream';
    var whatCell = bodyCell(
      styled(
        'span',
        {
          fontWeight: '600',
          textDecoration: entry.status === 'off' ? 'line-through' : 'none',
          color: entry.status === 'off' ? DIM : 'inherit',
        },
        what
      ),
      { opacity: fade }
    );

    var time = entry.status === 'off' ? '—' : entry.timeUnknown ? 'čas nevím' : entry.start || 'pravidelný';
    var timeIsDefault = !entry.start && !entry.timeUnknown && entry.status !== 'off';
    var timeCell = bodyCell(
      styled(
        'span',
        {
          fontFamily: entry.timeUnknown || entry.status === 'off' ? FONT : MONO,
          fontSize: '13px',
          fontStyle: entry.timeUnknown ? 'italic' : 'normal',
          color: timeIsDefault || entry.status === 'off' ? DIM : 'inherit',
        },
        time
      ),
      { whiteSpace: 'nowrap', textAlign: 'right', opacity: fade }
    );

    var noteCell = bodyCell(
      entry.note ? styled('span', { color: DIM }, entry.note) : '',
      { opacity: fade }
    );

    var bannerCell = bodyCell(
      entry.highlight
        ? styled(
            'span',
            {
              display: 'inline-block',
              padding: '1px 7px',
              borderRadius: '999px',
              border: '1px solid currentColor',
              fontSize: '10px',
              fontWeight: '700',
              letterSpacing: '0.08em',
            },
            'V BANNERU'
          )
        : styled('span', { color: DIM }, '—'),
      { whiteSpace: 'nowrap', textAlign: 'right', opacity: fade }
    );

    return h(
      'tr',
      {
        // Stable key: a random one would remount the row on every keystroke.
        key: index + ':' + date,
        style: duplicated ? { background: 'rgba(230, 90, 90, 0.14)' } : {},
      },
      [dateCell, whatCell, timeCell, noteCell, bannerCell]
    );
  }

  function note(text, tone) {
    return h(
      'p',
      {
        style: {
          display: 'flex',
          gap: '6px',
          margin: '10px 0 0',
          fontSize: '12px',
          lineHeight: '1.5',
          color: tone === 'warn' ? '#e8735f' : DIM,
        },
      },
      [
        styled('span', { flex: 'none' }, tone === 'warn' ? '⚠' : '·'),
        styled('span', {}, text),
      ]
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
        return h('div', { style: { padding: '16px 18px', fontFamily: FONT, fontSize: '13px' } }, children);
      };

      if (entries === null) {
        return wrap(styled('p', { margin: '0', color: DIM }, 'Náhled se nepodařilo načíst.'));
      }

      if (entries.length === 0) {
        return wrap(
          styled(
            'p',
            { margin: '0', color: DIM, lineHeight: '1.5' },
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

      var heading = styled(
        'p',
        {
          margin: '0 0 12px',
          fontSize: '11px',
          fontWeight: '600',
          letterSpacing: '0.09em',
          textTransform: 'uppercase',
          color: DIM,
        },
        entries.length + ' ' + plural(entries.length, 'výjimka', 'výjimky', 'výjimek')
      );

      var table = h(
        'table',
        { style: { width: '100%', borderCollapse: 'collapse', fontSize: '13px', lineHeight: '1.4' } },
        [
          h('thead', { key: 'head' }, h('tr', null, [
            headCell('Datum'),
            headCell('Co'),
            headCell('Čas', 'right'),
            headCell('Poznámka'),
            headCell('Banner', 'right'),
          ])),
          h(
            'tbody',
            { key: 'body' },
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
        ]
      );

      var children = [heading, table];

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
        note('Sloupec Banner je jen ruční zaškrtnutí — zrušený stream, jiný čas a nejistý čas se v banneru objeví i bez něj.')
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
