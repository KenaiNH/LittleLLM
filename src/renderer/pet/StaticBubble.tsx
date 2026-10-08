import surface from '../../../assets/figma/2016-89-imgBubbleSurface.svg';
import border from '../../../assets/figma/2016-89-imgInnerBorder.svg';
import continuation from '../../../assets/figma/2016-89-imgDialogueContinuation.svg';
import styles from './StaticBubble.module.css';
export function StaticBubble({name,text}:{name:string;text:string}){
  return <section className={styles.bubble} data-interactive data-testid="bubble" aria-label={`${name} dialogue`}>
    <img src={surface} className={styles.surface} alt=""/><img src={border} className={styles.border} alt=""/>
    <p className={styles.name}>{name}</p><p className={styles.text}>{text}</p>
    <span className={styles.continuation}><img src={continuation} alt=""/></span>
  </section>;
}
