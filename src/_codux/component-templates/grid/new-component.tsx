import { classes, st } from './new-component.st.css';

export interface NewComponentProps {
    className?: string;
}

/**
 * To create custom component templates, see https://help.codux.com/kb/en/article/kb16522
 */
export const NewComponent = ({ className }: NewComponentProps) => {
    return (
        <div className={st(classes.root, className)}>
            <div>
                <img
                    src="https://wixmp-b7f7090100b13623109851bc.wixmp.com/layouters/img_04 (1).jpg"
                    alt=""
                    className={classes.img}
                />
            </div>
            <div>
                <img
                    src="https://wixmp-b7f7090100b13623109851bc.wixmp.com/layouters/img_05 (1).jpg"
                    alt=""
                    className={classes.img}
                />
            </div>
            <div>
                <img
                    src="https://wixmp-b7f7090100b13623109851bc.wixmp.com/layouters/img_06 (1).jpg"
                    alt=""
                    className={classes.img}
                />
            </div>
            <div>
                <img
                    src="https://wixmp-b7f7090100b13623109851bc.wixmp.com/layouters/img_03 (1).jpg"
                    alt=""
                    className={classes.img}
                />
            </div>
        </div>
    );
};
