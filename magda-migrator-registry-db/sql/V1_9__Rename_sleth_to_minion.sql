
UPDATE webhooks
  SET name = 'minion-visualization',
      url = 'http://minion-visualization/hook'
  WHERE name = 'sleuther-visualization';

UPDATE webhooks
    SET name = 'minion-broken-link',
        url = 'http://minion-broken-link/hook'
    WHERE name = 'sleuther-broken-link';

UPDATE webhooks
    SET name = 'minion-format',
        url = 'http://minion-format/hook'
    WHERE name = 'sleuther-format';

UPDATE webhooks
    SET name = 'minion-linked-data-rating',
        url = 'http://minion-linked-data-rating/hook'
    WHERE name = 'sleuther-linked-data-rating';
