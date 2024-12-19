import { classes, st } from './new-component.st.css';

export interface NewComponentProps {
    className?: string;
}

/**
 * This component was created using Codux's Default new component template.
 * To create custom component templates, see https://help.codux.com/kb/en/article/kb16522
 */
export const NewComponent = ({ className }: NewComponentProps) => {
    return (
        <div className={st(className, classes.root)}>
            <div>
                <img
                    src="https://wixmp-b7f7090100b13623109851bc.wixmp.com/layouters/img_01 (1).jpg"
                    alt=""
                    className={classes.img}
                />
            </div>
            <div className={classes.section}>
                <img
                    src="https://wixmp-b7f7090100b13623109851bc.wixmp.com/layouters/img_06 (1).jpg"
                    alt=""
                    className={classes.img}
                />
                <img
                    src="https://wixmp-b7f7090100b13623109851bc.wixmp.com/layouters/img_03 (1).jpg"
                    alt=""
                    className={classes.img}
                />
            </div>
        </div>
    );
};
