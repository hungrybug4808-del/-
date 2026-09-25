import type { BuddyId } from './models';

// バディ4人の名前・見た目・スキル・性格とせりふ

export type PlanKind = 'defend' | 'vein' | 'attack' | 'terrain';

export interface BuddyDef {
  id: BuddyId;
  name: string;
  origin: string;
  icon: string;
  look: string;
  skillName: string;
  skillDesc: string;
  /** スキルの場所をタップで選ぶか */
  targeted: boolean;
  personality: string;
  /** 提案しやすい作戦 */
  prefer: PlanKind;
  lines: Record<PlanKind, (place: string) => string> & { hello: string; ready: string; cast: string; ok: string };
}

export const BUDDIES: BuddyDef[] = [
  {
    id: 'uni', name: 'ユニ', origin: 'ユニコーン', icon: '🦄', look: '額に小さな角飾り、白いローブ、たてがみ風の長い髪',
    skillName: '癒やしの光', skillDesc: 'タップした場所のまわりの味方を回復', targeted: true,
    personality: 'おっとりした心配性。守りを勧める', prefer: 'defend',
    lines: {
      defend: p => `あわわ…${p}が危ないです。みんなで守りに行きませんか？`,
      vein: p => `${p}の竜脈、今なら取れそうです…行ってみます？`,
      attack: p => `${p}を攻めるんですか…？ 気をつけてくださいね`,
      terrain: () => '高いところなら、少しは安全かも…弓の子たちを上げませんか？',
      hello: 'よろしくお願いします…けが人が出たら、すぐ治しますね',
      ready: '癒やしの光、使えます。けがをした子の所をタップしてくださいね',
      cast: 'みんな、痛いの痛いの…とんでいけ〜！',
      ok: 'はい、行ってらっしゃい…無理しないでね',
    },
  },
  {
    id: 'mina', name: 'ミナ', origin: 'ドワーフ（白雪姫の小人など）', icon: '⛏️', look: 'ランプ付きヘルメット、小さなツルハシ、背が低い',
    skillName: '竜脈掘り', skillDesc: '20秒間、竜脈の占領が3倍速くなる', targeted: false,
    personality: '元気な宝探し好き。竜脈を取る作戦を勧める', prefer: 'vein',
    lines: {
      vein: p => `${p}の竜脈にお宝の匂い！ 掘りに行こうよ！`,
      defend: p => `わわっ、${p}に敵だよ！ 戻って戻って！`,
      attack: p => `${p}に突撃〜！ ついでにお宝もいただきだ！`,
      terrain: () => '高台から見下ろせば、ばっちり狙えるよ！',
      hello: 'ミナだよ！ 竜脈のお宝、ぜーんぶ掘り当てようね！',
      ready: '竜脈掘り、いけるよ！ ボタンを押してね！',
      cast: 'ツルハシ全開！ 掘って掘って掘りまくれ〜！',
      ok: 'よーし、出発〜！',
    },
  },
  {
    id: 'val', name: 'ヴァル', origin: 'ワルキューレ', icon: '🪽', look: '羽根付きの兜、小ぶりな鎧と槍',
    skillName: '戦乙女の鼓舞', skillDesc: 'タップした場所のまわりの味方が12秒間、攻撃も移動も1.5倍の速さに', targeted: true,
    personality: '強気で勇ましい。攻めを勧める', prefer: 'attack',
    lines: {
      attack: p => `今こそ攻め時だ！ 敵の${p}へ全軍突撃！`,
      defend: p => `${p}を落とさせはしない！ 守りを固めろ！`,
      vein: p => `${p}の竜脈を押さえて、力を蓄えるぞ！`,
      terrain: () => '高台を取れ！ 上から射抜け！',
      hello: 'ヴァルだ。勝利はわたしたちのものだ！',
      ready: '鼓舞の準備はできた！ 戦っている所をタップしろ！',
      cast: '勇ましき者たちよ、進め！',
      ok: 'よし、行け！',
    },
  },
  {
    id: 'leaf', name: 'リーフ', origin: 'エルフ', icon: '🏹', look: 'とがった耳、緑のマント、長弓',
    skillName: '森の目', skillDesc: '15秒間、味方の遠距離モンスターの射程が伸びる', targeted: false,
    personality: '冷静な物知り。高台など地形を活かす作戦を勧める', prefer: 'terrain',
    lines: {
      terrain: () => '高台に上がれば射程が伸びます。弓の者たちを北の高台へ。',
      vein: p => `${p}の竜脈を押さえれば、魔素の回復が50%速くなります。`,
      defend: p => `${p}に敵が集まっています。守りを固めるべきです。`,
      attack: p => `敵の${p}が手薄です。今が攻め時でしょう。`,
      hello: 'リーフです。地形を読めば、戦いは有利に運べます。',
      ready: '森の目が使えます。遠距離の者たちの射程を伸ばしましょう。',
      cast: '風よ、矢を遠くへ運べ。',
      ok: '承知しました。',
    },
  },
];

