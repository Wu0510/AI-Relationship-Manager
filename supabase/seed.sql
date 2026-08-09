-- ============================================================================
--  Seed：把原型 app.js 的 INITIAL_CUSTOMERS / FOLLOWUPS / TODOS 灌進 Supabase
--  前置：先在 Supabase Auth 建立一個帳號（例：rm@bank.com），
--        handle_new_user() 觸發器會自動建立對應的 advisors 資料列。
--  金額換算：原型單位為「萬」，此處一律 ×10000 存成「元」。
-- ============================================================================

do $$
declare
  v_advisor uuid;
  v_id      uuid;
  v_existing int;
begin
  select id into v_advisor from public.advisors where email = 'rm@bank.com';
  if v_advisor is null then
    raise exception '找不到 rm@bank.com 的 advisor，請先在 Supabase Auth 建立此帳號';
  end if;

  -- 冪等性防護：這支腳本被重複執行過 4 次，造成 32 位客戶（應為 8 位）。
  -- 若已有資料就直接跳過，要重灌請先手動清空：
  --   delete from public.customers where advisor_id = (select id from public.advisors where email='rm@bank.com');
  --   delete from public.tasks      where advisor_id = (select id from public.advisors where email='rm@bank.com');
  --   delete from public.market_snapshots;
  select count(*) into v_existing from public.customers where advisor_id = v_advisor;
  if v_existing > 0 then
    raise notice '已有 % 位客戶，跳過 seed（避免重複灌入）', v_existing;
    return;
  end if;

  update public.advisors set name = '陳經理', branch = '台北信義分行', stale_days = 45
   where id = v_advisor;

  -- ── 1. 王小明 ────────────────────────────────────────────────────────────
  insert into public.customers (advisor_id, name, age, occupation, family_status, aum_twd,
                                invest_style, risk_level, birthday, last_contact_at, note, tags)
  values (v_advisor, '王小明', 45, '工程師', '已婚，育有 2 名子女', 8000000,
          '積極型', 'RR4', '1981-02-10', '2026-07-14',
          '對 ETF 與科技類股興趣高，近期詢問加碼時機。',
          array['偏好ETF','資產穩定成長','積極投資'])
  returning id into v_id;

  insert into public.customer_assets (customer_id, asset_type, product_name, product_code,
                                      amount_twd, return_pct, maturity_date) values
    (v_id, 'ETF', '元大台灣50 (0050)', '0050', 1500000, 12, null),
    (v_id, '基金', '全球科技創新基金', null,     2000000, null, '2026-09-10');

  insert into public.interaction_logs (customer_id, channel, occurred_at, raw_note, ai_summary,
                                       needs, reaction, next_contact_date, follow_up_action) values
    (v_id, 'phone', '2026-07-14 10:00+08', '討論 0050 近期漲幅，客戶表達加碼意願。',
     '討論 0050 近期漲幅，客戶表達加碼意願。', array['ETF加碼意願'], '正面', '2026-08-05', '提供加碼建議書');

  insert into public.follow_ups (customer_id, content, due_date) values
    (v_id, '提供加碼建議書', '2026-08-05');

  -- ── 2. 林淑芬 ────────────────────────────────────────────────────────────
  insert into public.customers (advisor_id, name, age, occupation, family_status, aum_twd,
                                invest_style, risk_level, birthday, last_contact_at, note, tags)
  values (v_advisor, '林淑芬', 52, '自營商', '已婚，育有 1 名子女', 12000000,
          '積極型', 'RR5', '1974-01-01', '2026-05-28',
          '高資產客戶，近期較少聯繫，需留意競品挖角風險。',
          array['久未聯繫','高資產客戶'])
  returning id into v_id;

  insert into public.customer_assets (customer_id, asset_type, product_name, amount_twd, maturity_date)
  values (v_id, '定存', '一年期定存', 3000000, '2026-07-20');

  insert into public.interaction_logs (customer_id, channel, occurred_at, raw_note, ai_summary,
                                       needs, reaction, next_contact_date, follow_up_action) values
    (v_id, 'phone', '2026-05-28 14:00+08', '客戶提到有多家銀行主動接觸，需持續維繫關係。',
     '客戶提到有多家銀行主動接觸，需持續維繫關係。', array['關係維繫'], '中立', '2026-07-01', '定期關心近況');

  insert into public.tasks (advisor_id, customer_id, kind, title, starts_at, ends_at) values
    (v_advisor, v_id, 'call', '致電林淑芬：定存到期前確認續存意願',
     '2026-07-17 09:30+08', '2026-07-17 10:00+08');

  -- ── 3. 陳建國 ────────────────────────────────────────────────────────────
  insert into public.customers (advisor_id, name, age, occupation, family_status, aum_twd,
                                invest_style, risk_level, birthday, last_contact_at, note, tags)
  values (v_advisor, '陳建國', 60, '退休人士', '已婚', 5000000,
          '保守型', 'RR2', '1966-07-20', '2026-07-17',
          '退休族群，重視穩定收益，偏好定存與保本型商品。',
          array['保守型','定存到期'])
  returning id into v_id;

  insert into public.customer_assets (customer_id, asset_type, product_name, amount_twd, maturity_date)
  values (v_id, '定存', '半年期定存', 2000000, '2026-07-17');

  insert into public.interaction_logs (customer_id, channel, occurred_at, raw_note, ai_summary,
                                       needs, reaction, next_contact_date, follow_up_action) values
    (v_id, 'phone', '2026-07-17 09:00+08', '告知定存今日到期，客戶考慮續存。',
     '告知定存今日到期，客戶考慮續存。', array['定存續存'], '正面', '2026-07-18', '確認續存金額與期別');

  insert into public.tasks (advisor_id, customer_id, kind, title, starts_at, ends_at, is_done, completed_at)
  values (v_advisor, v_id, 'call', '致電陳建國：確認定存續存金額與期別',
          '2026-07-17 11:00+08', '2026-07-17 11:30+08', true, '2026-07-17 11:25+08');

  -- ── 4. 李美惠 ────────────────────────────────────────────────────────────
  insert into public.customers (advisor_id, name, age, occupation, family_status, aum_twd,
                                invest_style, risk_level, birthday, last_contact_at, note, tags)
  values (v_advisor, '李美惠', 38, '藥師', '未婚', 3500000,
          '穩健型', 'RR3', '1988-11-11', '2026-06-01',
          '工作繁忙，聯繫需簡潔扼要。', array['久未聯繫','穩健投資'])
  returning id into v_id;

  insert into public.customer_assets (customer_id, asset_type, product_name, amount_twd)
  values (v_id, '基金', '平衡型收益基金', 800000);

  insert into public.interaction_logs (customer_id, channel, occurred_at, raw_note, ai_summary,
                                       needs, reaction, next_contact_date, follow_up_action) values
    (v_id, 'phone', '2026-06-01 16:00+08', '客戶提到近期工作忙碌，暫緩投資調整。',
     '客戶提到近期工作忙碌，暫緩投資調整。', array['一般關係維繫'], '中立', '2026-07-10', '確認保單續期意願');

  insert into public.follow_ups (customer_id, content, due_date) values
    (v_id, '確認保單續期意願', '2026-07-10');

  insert into public.tasks (advisor_id, customer_id, kind, title, starts_at, ends_at) values
    (v_advisor, v_id, 'call', '致電李美惠：確認保單續期意願',
     '2026-07-17 10:00+08', '2026-07-17 10:20+08');

  -- ── 5. 張家豪 ────────────────────────────────────────────────────────────
  insert into public.customers (advisor_id, name, age, occupation, family_status, aum_twd,
                                invest_style, risk_level, birthday, joined_date, last_contact_at, note, tags)
  values (v_advisor, '張家豪', 33, '軟體工程師', '未婚', 2200000,
          '積極型', 'RR4', '1993-03-03', '2026-07-02', '2026-07-10',
          '年輕族群，關注被動收入與高股息標的。', array['ETF追蹤','年輕高潛力客戶'])
  returning id into v_id;

  insert into public.customer_assets (customer_id, asset_type, product_name, product_code, amount_twd, return_pct)
  values (v_id, 'ETF', '元大高股息 (0056)', '0056', 600000, 6);

  insert into public.interaction_logs (customer_id, channel, occurred_at, raw_note, ai_summary,
                                       needs, reaction, next_contact_date, follow_up_action) values
    (v_id, 'phone', '2026-07-10 15:00+08', '討論 0056 配息狀況，客戶表示滿意。',
     '討論 0056 配息狀況，客戶表示滿意。', array['高股息ETF資訊'], '正面', '2026-08-10', '提供下季配息預估');

  -- ── 6. 黃雅婷 ────────────────────────────────────────────────────────────
  insert into public.customers (advisor_id, name, age, occupation, family_status, aum_twd,
                                invest_style, risk_level, birthday, last_contact_at, note, tags)
  values (v_advisor, '黃雅婷', 48, '教師', '已婚，育有 1 名子女', 6500000,
          '穩健型', 'RR3', '1978-12-01', '2026-07-05',
          '重視子女教育金規劃。', array['穩健投資','子女教育金需求'])
  returning id into v_id;

  insert into public.customer_assets (customer_id, asset_type, product_name, amount_twd, maturity_date)
  values (v_id, '基金', '新興市場債券基金', 1500000, '2026-07-22');

  insert into public.interaction_logs (customer_id, channel, occurred_at, raw_note, ai_summary,
                                       needs, reaction, next_contact_date, follow_up_action) values
    (v_id, 'phone', '2026-07-05 11:00+08', '討論教育金規劃方向，客戶希望穩健增值。',
     '討論教育金規劃方向，客戶希望穩健增值。', array['子女教育金規劃'], '正面', '2026-07-17', '確認基金轉換意願');

  insert into public.follow_ups (customer_id, content, due_date) values
    (v_id, '確認基金轉換意願', '2026-07-17');

  insert into public.tasks (advisor_id, customer_id, kind, title, starts_at, ends_at) values
    (v_advisor, v_id, 'visit', '約訪黃雅婷：子女教育金規劃討論',
     '2026-07-17 14:00+08', '2026-07-17 15:00+08');

  -- ── 7. 吳志偉 ────────────────────────────────────────────────────────────
  insert into public.customers (advisor_id, name, age, occupation, family_status, aum_twd,
                                invest_style, risk_level, birthday, last_contact_at, note, tags)
  values (v_advisor, '吳志偉', 55, '醫師', '已婚', 15000000,
          '積極型', 'RR5', '1971-07-18', '2026-06-20',
          '高資產客戶，對永續投資議題有興趣。', array['高資產客戶','ESG投資關注'])
  returning id into v_id;

  insert into public.customer_assets (customer_id, asset_type, product_name, product_code, amount_twd, return_pct)
  values (v_id, 'ETF', '國泰永續高股息 (00878)', '00878', 3000000, 3);

  insert into public.interaction_logs (customer_id, channel, occurred_at, raw_note, ai_summary,
                                       needs, reaction, next_contact_date, follow_up_action) values
    (v_id, 'phone', '2026-06-20 13:00+08', '討論 ESG 相關投資標的，客戶興趣濃厚。',
     '討論 ESG 相關投資標的，客戶興趣濃厚。', array['ESG投資資訊'], '正面', '2026-07-20', '提供 ESG 主題基金資料');

  -- ── 8. 蔡佩珊 ────────────────────────────────────────────────────────────
  insert into public.customers (advisor_id, name, age, occupation, family_status, aum_twd,
                                invest_style, risk_level, birthday, joined_date, last_contact_at, note, tags)
  values (v_advisor, '蔡佩珊', 41, '公務員', '已婚，育有 1 名子女', 3000000,
          '保守型', 'RR2', '1985-05-20', '2026-07-11', '2026-07-03',
          '關注退休金規劃，希望提早準備。', array['退休規劃需求','保守型'])
  returning id into v_id;

  insert into public.customer_assets (customer_id, asset_type, product_name, amount_twd, maturity_date)
  values (v_id, '定存', '一年期定存', 1000000, '2026-10-01');

  insert into public.interaction_logs (customer_id, channel, occurred_at, raw_note, ai_summary,
                                       needs, reaction, next_contact_date, follow_up_action) values
    (v_id, 'phone', '2026-07-03 09:30+08', '客戶詢問退休金規劃相關工具。',
     '客戶詢問退休金規劃相關工具。', array['退休規劃需求'], '正面', '2026-07-18', '寄送退休試算表');

  insert into public.follow_ups (customer_id, content, due_date) values
    (v_id, '寄送退休試算表', '2026-07-18');

  insert into public.tasks (advisor_id, customer_id, kind, title, starts_at, ends_at) values
    (v_advisor, v_id, 'task', '寄送蔡佩珊退休試算表',
     '2026-07-17 15:30+08', '2026-07-17 16:00+08');
end $$;

-- ── 市場動態（Mock，正式環境改由排程 job 寫入） ─────────────────────────────
insert into public.market_snapshots (snapshot_date, headline, summary, category, indices, source) values
  (current_date, '台股加權指數收紅 0.8%，電子權值股領漲',
   'AI 伺服器供應鏈需求續強，台積電上漲 1.2%，帶動大盤站回月線。三大法人合計買超 92 億元。',
   '台股', '{"TAIEX":{"close":23150,"changePct":0.8},"volume_bn":3820}'::jsonb, 'mock'),
  (current_date, '央行維持利率不變，一年期定存牌告利率持平於 1.6%',
   '市場預期升息循環已結束，短天期定存吸引力下降，資金開始轉向高股息 ETF 與投等債。',
   '利率', '{"policy_rate":2.0,"1y_time_deposit":1.6}'::jsonb, 'mock'),
  (current_date, '美股四大指數同步收高，費半漲 1.9%',
   '通膨數據低於預期，市場對降息預期升溫，科技股與成長股表現亮眼。',
   '美股', '{"SP500":{"changePct":0.6},"SOX":{"changePct":1.9}}'::jsonb, 'mock'),
  (current_date, '新台幣兌美元升值 0.15%，收在 30.85 元',
   '外資匯入動能延續，惟出口商拋匯壓力仍在，短線區間震盪。',
   '匯率', '{"USDTWD":30.85}'::jsonb, 'mock')
on conflict do nothing;
