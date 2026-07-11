-- 不足している科目を追加(既存の科目は重複させない)
INSERT OR IGNORE INTO subjects (user_id, name) VALUES (1, 'ネスペ');
INSERT OR IGNORE INTO subjects (user_id, name) VALUES (1, '簿記3級');
INSERT OR IGNORE INTO subjects (user_id, name) VALUES (1, 'AZ-104');

-- 学習ログ(直近1週間、複数科目)
INSERT INTO study_logs (user_id, subject_id, studied_on, minutes, memo, recall_score)
VALUES (1, (SELECT id FROM subjects WHERE user_id = 1 AND name = 'Rails'), '2026-07-05', 45, 'Migrationの復習', 4);

INSERT INTO study_logs (user_id, subject_id, studied_on, minutes, memo, recall_score)
VALUES (1, (SELECT id FROM subjects WHERE user_id = 1 AND name = 'ネスペ'), '2026-07-05', 60, '午後1過去問', 3);

INSERT INTO study_logs (user_id, subject_id, studied_on, minutes, memo, recall_score)
VALUES (1, (SELECT id FROM subjects WHERE user_id = 1 AND name = 'Rails'), '2026-07-06', 30, 'Model設計', 4);

INSERT INTO study_logs (user_id, subject_id, studied_on, minutes, memo, recall_score)
VALUES (1, (SELECT id FROM subjects WHERE user_id = 1 AND name = '簿記3級'), '2026-07-06', 40, '仕訳問題', 2);

INSERT INTO study_logs (user_id, subject_id, studied_on, minutes, memo, recall_score)
VALUES (1, (SELECT id FROM subjects WHERE user_id = 1 AND name = 'ネスペ'), '2026-07-07', 50, 'サブネット計算', 3);

INSERT INTO study_logs (user_id, subject_id, studied_on, minutes, memo, recall_score)
VALUES (1, (SELECT id FROM subjects WHERE user_id = 1 AND name = 'AZ-104'), '2026-07-07', 35, 'VNet構築演習', 4);

INSERT INTO study_logs (user_id, subject_id, studied_on, minutes, memo, recall_score)
VALUES (1, (SELECT id FROM subjects WHERE user_id = 1 AND name = 'Rails'), '2026-07-08', 55, 'Controller実装', 5);

INSERT INTO study_logs (user_id, subject_id, studied_on, minutes, memo, recall_score)
VALUES (1, (SELECT id FROM subjects WHERE user_id = 1 AND name = '簿記3級'), '2026-07-08', 30, '精算表', 3);

INSERT INTO study_logs (user_id, subject_id, studied_on, minutes, memo, recall_score)
VALUES (1, (SELECT id FROM subjects WHERE user_id = 1 AND name = 'ネスペ'), '2026-07-09', 70, '午後2過去問', 2);

INSERT INTO study_logs (user_id, subject_id, studied_on, minutes, memo, recall_score)
VALUES (1, (SELECT id FROM subjects WHERE user_id = 1 AND name = 'AZ-104'), '2026-07-09', 40, 'ARMテンプレート', 4);

INSERT INTO study_logs (user_id, subject_id, studied_on, minutes, memo, recall_score)
VALUES (1, (SELECT id FROM subjects WHERE user_id = 1 AND name = 'Rails'), '2026-07-10', 25, 'D1接続部分の復習', NULL);

INSERT INTO study_logs (user_id, subject_id, studied_on, minutes, memo, recall_score)
VALUES (1, (SELECT id FROM subjects WHERE user_id = 1 AND name = '簿記3級'), '2026-07-10', 45, '模擬試験', 3);

INSERT INTO study_logs (user_id, subject_id, studied_on, minutes, memo, recall_score)
VALUES (1, (SELECT id FROM subjects WHERE user_id = 1 AND name = 'ネスペ'), '2026-07-11', 60, '午前2一問一答', 4);

INSERT INTO study_logs (user_id, subject_id, studied_on, minutes, memo, recall_score)
VALUES (1, (SELECT id FROM subjects WHERE user_id = 1 AND name = 'AZ-104'), '2026-07-11', 30, '模擬試験', 5);