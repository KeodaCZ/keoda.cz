/**
 * Custom preview pane for the schedule exceptions.
 *
 * Row layout follows the site's calendar (date badge, title, time on the
 * right), but the colours are taken from the admin around it rather than from
 * the site: a second colour scheme mid-panel just looked like a seam. The
 * built-in preview listed every field one per line on a white page.
 *
 * `createClass` and `h` are globals provided by the CMS, so no React script is
 * needed. Presentation only — no scheduling rules are reimplemented here,
 * because a second copy would drift from src/lib/schedule-core.ts.
 */
(function () {
  var WEEKDAYS = ['NE', 'PO', 'ÚT', 'ST', 'ČT', 'PÁ', 'SO'];

  // This file runs in the admin window, so the admin's own computed styles are
  // readable. Borders and muted text stay neutral greys, which sit correctly on
  // either a light or a dark ground.
  var EDGE = 'rgba(128, 128, 128, 0.28)';
  var FONT =
    'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  var FALLBACK = { bg: '#1e1e1e', fg: '#e8e8e8', accent: '#f2dc5a', card: 'rgba(255,255,255,.04)' };

  /** Rough luminance test, so the accent stays readable on either theme. */
  function isDark(color) {
    var parts = String(color).match(/\d+(\.\d+)?/g);
    if (!parts || parts.length < 3) return true;
    var luminance =
      (0.2126 * Number(parts[0]) + 0.7152 * Number(parts[1]) + 0.0722 * Number(parts[2])) / 255;
    return luminance < 0.5;
  }

  function isOpaque(color) {
    return Boolean(color) && color !== 'transparent' && !/,\s*0\s*\)$/.test(color);
  }

  /** First opaque background found walking up from `node`, or ''. */
  function surfaceOf(node) {
    while (node) {
      var candidate = getComputedStyle(node).backgroundColor;
      if (isOpaque(candidate)) return candidate;
      node = node.parentElement;
    }
    return '';
  }

  /**
   * The colours of the pane the preview sits in, so it blends into the admin
   * instead of introducing its own scheme.
   *
   * Starting at <body> did not work: Sveltia paints its backgrounds on nested
   * app elements, so the walk found nothing opaque and always fell back to a
   * grey — which is why this looked grey on a light admin and grey against
   * blue on a dark one. Starting at the preview's own iframe and walking out
   * lands on the actual surrounding surface.
   */
  function adminTheme() {
    try {
      var frame = document.querySelector('iframe');
      var host = frame ? frame.parentElement : null;
      var bg = surfaceOf(host) || surfaceOf(document.body || document.documentElement);
      var fg = getComputedStyle(host || document.body || document.documentElement).color;

      // With no usable background, fall back on whether the admin's text is
      // light — that still tells us which way round the theme is.
      if (!bg) {
        var darkByText = !isDark(fg || FALLBACK.fg);
        return {
          bg: darkByText ? '#1e1e1e' : '#fafafa',
          fg: fg || (darkByText ? FALLBACK.fg : '#1e1e1e'),
          accent: darkByText ? '#f2dc5a' : '#6f621a',
          card: darkByText ? 'rgba(255,255,255,.045)' : 'rgba(0,0,0,.035)',
        };
      }

      var dark = isDark(bg);
      return {
        bg: bg,
        fg: fg || (dark ? FALLBACK.fg : '#1e1e1e'),
        // Keoda's yellow on dark; the site's light-mode gold where yellow
        // would be unreadable.
        accent: dark ? '#f2dc5a' : '#6f621a',
        card: dark ? 'rgba(255,255,255,.045)' : 'rgba(0,0,0,.035)',
      };
    } catch (error) {
      return FALLBACK;
    }
  }

  // Set once per render so the row helpers can reach it.
  var C = FALLBACK;

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
          { fontSize: '9px', letterSpacing: '0.14em', color: C.fg, opacity: '0.6', marginTop: '1px' },
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
          color: cancelled || entry.timeUnknown || timeIsPattern ? C.fg : C.accent,
          opacity: cancelled || entry.timeUnknown || timeIsPattern ? '0.6' : '1',
        },
        time
      ),
    ];
    if (entry.timeUnknown) {
      right.push(
        el('div', { fontSize: '9px', letterSpacing: '0.1em', color: C.fg, opacity: '0.6', marginTop: '2px' }, 'ČAS NEVÍM')
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
          color: C.fg,
          opacity: cancelled ? '0.6' : '1',
        },
        title
      ),
    ];
    if (entry.note) {
      middle.push(el('div', { fontSize: '12px', color: C.fg, opacity: '0.6', marginTop: '2px' }, entry.note));
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
              border: '1px solid ' + C.accent,
              color: C.accent,
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
          background: C.card,
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
          color: tone === 'warn' ? '#e8735f' : C.fg,
        },
      },
      [el('span', { flex: 'none' }, tone === 'warn' ? '⚠' : '·'), el('span', {}, text)]
    );
  }

  var previewSpec = {
    render: function () {
      // Re-read each render so switching the admin theme is picked up.
      C = adminTheme();

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
              // Fixed to the iframe's own viewport so the ground covers it
              // edge to edge, whatever margin or background the preview
              // document carries. Styling that body alone left a pale frame.
              position: 'fixed',
              inset: '0',
              overflow: 'auto',
              padding: '16px 18px',
              background: C.bg,
              color: C.fg,
              fontFamily: FONT,
              fontSize: '13px',
            },
          },
          children
        );
      };

      if (entries === null) {
        return wrap(el('p', { margin: '0', color: C.fg, opacity: '0.6' }, 'Náhled se nepodařilo načíst.'));
      }

      if (entries.length === 0) {
        return wrap(
          el(
            'p',
            { margin: '0', color: C.fg, opacity: '0.6', lineHeight: '1.5' },
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
            color: C.fg, opacity: '0.6',
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

  // The preview runs in its own iframe, whose <body> keeps the browser's white
  // background and 8px margin. A component cannot reach that body, so it is
  // styled from here; the fixed wrapper covers it regardless.
  function iframeCss() {
    var theme = adminTheme();
    return 'html, body { margin: 0; padding: 0; background: ' + theme.bg + '; color: ' + theme.fg + '; }';
  }

  function register() {
    if (typeof window.CMS === 'undefined') return false;
    if (typeof createClass === 'undefined' || typeof h === 'undefined') return false;
    if (typeof window.CMS.registerPreviewStyle === 'function') {
      window.CMS.registerPreviewStyle(iframeCss(), { raw: true });
    }
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
