import type { EffectScript, ScriptStep } from '@workspace/effect-registry';

/** Both current and maximum HP are captured before either selected wrestler changes. */
export function lifeExchangeConfig(config: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(config.scripts)) return config;
  return { ...config, scripts: (config.scripts as EffectScript[]).map(script => {
    if (!Array.isArray(script.steps) || !script.steps.some(step => step.type === 'AGGREGATE' && step.id === 'allyStat')) return script;
    if (script.steps.some(step => step.type === 'AGGREGATE' && step.id === 'allyMax')) return script;
    const steps: ScriptStep[] = [];
    for (const step of script.steps) {
      steps.push(step.type === 'EFFECT' && step.effect.action === 'SET_STAT' && step.effect.values?.stat === 'HEALTH'
        ? { ...step, effect: { ...step.effect, values: { ...step.effect.values, currentHealthOnly: false,
          maxHealthExpression: { kind: 'RESULT_VALUE', resultId: step.effect.target?.resultId === 'ally' ? 'enemyMax' : 'allyMax' } } } }
        : step);
      if (step.type === 'AGGREGATE' && step.id === 'enemyStat') {
        steps.push({ type: 'AGGREGATE', id: 'allyMax', selectionId: 'ally', operation: 'SUM', stat: 'MAX_HEALTH' },
          { type: 'AGGREGATE', id: 'enemyMax', selectionId: 'enemy', operation: 'SUM', stat: 'MAX_HEALTH' });
      }
    }
    return { ...script, steps };
  }) };
}
