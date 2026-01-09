/**
 * Base Component and Typed Renderable Wrappers
 * Provides type-safe methods for updating OpenTUI renderables
 * Eliminates the need for `as any` casts throughout the codebase
 */

import type {
	BoxRenderable,
	Renderable,
	TextRenderable,
} from "@opentui/core";

/**
 * Properties that can be updated on a Box renderable
 */
export interface BoxProps {
	width?: number;
	height?: number;
	left?: number;
	top?: number;
	backgroundColor?: string;
	borderColor?: string;
	borderStyle?: "single" | "double" | "rounded" | "bold" | "none";
}

/**
 * Properties that can be updated on a Text renderable
 */
export interface TextProps {
	content?: string;
	fg?: string;
	bg?: string;
	left?: number;
	top?: number;
}

/**
 * Typed wrapper for BoxRenderable
 * Provides type-safe property updates without casting
 */
export class TypedBox {
	constructor(private renderable: BoxRenderable) {}

	/**
	 * Get the underlying renderable
	 */
	get raw(): BoxRenderable {
		return this.renderable;
	}

	/**
	 * Update box properties
	 */
	update(props: BoxProps): void {
		const r = this.renderable as any;

		if (props.width !== undefined) r.width = props.width;
		if (props.height !== undefined) r.height = props.height;
		if (props.left !== undefined) r.left = props.left;
		if (props.top !== undefined) r.top = props.top;
		if (props.backgroundColor !== undefined)
			r.backgroundColor = props.backgroundColor;
		if (props.borderColor !== undefined) r.borderColor = props.borderColor;
		if (props.borderStyle !== undefined) r.borderStyle = props.borderStyle;
	}

	/**
	 * Set width
	 */
	setWidth(width: number): void {
		(this.renderable as any).width = width;
	}

	/**
	 * Set height
	 */
	setHeight(height: number): void {
		(this.renderable as any).height = height;
	}

	/**
	 * Set position
	 */
	setPosition(left: number, top: number): void {
		const r = this.renderable as any;
		r.left = left;
		r.top = top;
	}

	/**
	 * Set background color
	 */
	setBackgroundColor(color: string): void {
		(this.renderable as any).backgroundColor = color;
	}
}

/**
 * Typed wrapper for TextRenderable
 * Provides type-safe property updates without casting
 */
export class TypedText {
	constructor(private renderable: TextRenderable) {}

	/**
	 * Get the underlying renderable
	 */
	get raw(): TextRenderable {
		return this.renderable;
	}

	/**
	 * Update text properties
	 */
	update(props: TextProps): void {
		const r = this.renderable as any;

		if (props.content !== undefined) r.content = props.content;
		if (props.fg !== undefined) r.fg = props.fg;
		if (props.bg !== undefined) r.bg = props.bg;
		if (props.left !== undefined) r.left = props.left;
		if (props.top !== undefined) r.top = props.top;
	}

	/**
	 * Set content
	 */
	setContent(content: string): void {
		(this.renderable as any).content = content;
	}

	/**
	 * Set foreground color
	 */
	setForeground(fg: string): void {
		(this.renderable as any).fg = fg;
	}

	/**
	 * Set background color
	 */
	setBackground(bg: string): void {
		(this.renderable as any).bg = bg;
	}

	/**
	 * Set colors
	 */
	setColors(fg: string, bg: string): void {
		const r = this.renderable as any;
		r.fg = fg;
		r.bg = bg;
	}

	/**
	 * Set position
	 */
	setPosition(left: number, top: number): void {
		const r = this.renderable as any;
		r.left = left;
		r.top = top;
	}
}

/**
 * Base component class with typed renderable management
 */
export abstract class BaseComponent {
	protected boxes = new Map<string, TypedBox>();
	protected texts = new Map<string, TypedText>();

	/**
	 * Wrap a box renderable for type-safe updates
	 */
	protected wrapBox(id: string, renderable: BoxRenderable): TypedBox {
		const wrapped = new TypedBox(renderable);
		this.boxes.set(id, wrapped);
		return wrapped;
	}

	/**
	 * Wrap a text renderable for type-safe updates
	 */
	protected wrapText(id: string, renderable: TextRenderable): TypedText {
		const wrapped = new TypedText(renderable);
		this.texts.set(id, wrapped);
		return wrapped;
	}

	/**
	 * Get a wrapped box by ID
	 */
	protected getBox(id: string): TypedBox | undefined {
		return this.boxes.get(id);
	}

	/**
	 * Get a wrapped text by ID
	 */
	protected getText(id: string): TypedText | undefined {
		return this.texts.get(id);
	}

	/**
	 * Clear all wrapped renderables
	 */
	protected clearWrapped(): void {
		this.boxes.clear();
		this.texts.clear();
	}
}

/**
 * Helper function to create a typed box wrapper
 */
export function typedBox(renderable: BoxRenderable): TypedBox {
	return new TypedBox(renderable);
}

/**
 * Helper function to create a typed text wrapper
 */
export function typedText(renderable: TextRenderable): TypedText {
	return new TypedText(renderable);
}
